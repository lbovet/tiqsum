import fs from "fs";
import PDFParser from "pdf2json";
import path from "path";
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { of, from, EMPTY, concat } from "rxjs";
import { filter, map, take, concatMap, tap, buffer, windowToggle, share, mergeMap, toArray } from "rxjs/operators";
import { Axios } from 'axios-observable';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourceDir = "source";
const sourcePath = path.join(__dirname, sourceDir);
const cachePath = path.join(__dirname, "cache");
const locationCacheFile = path.join(cachePath, "locations.json");
const locations = JSON.parse(fs.readFileSync(locationCacheFile));
const zones = {};

Object.entries(JSON.parse(fs.readFileSync(path.join(cachePath, "zones.json"))))
    .forEach(entry => { entry[1].forEach(name => { zones[name] = entry[0] }) });

function scanSource() {
    return from(fs.promises.readdir(sourcePath).then(files => files.map(file => path.join(sourceDir, file))))
        .pipe(concatMap(x => x));
}

function parseFile(path) {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();
        pdfParser.on("pdfParser_dataError", reject);
        pdfParser.on("pdfParser_dataReady", doc => resolve({ path, doc }));
        pdfParser.loadPDF(path);
    })
}

function extractMonth(path) {
    return path.match(/FAIRTIQ_(\d{4}-\d{2}).*/)[1];
}

function isTimestamp(s) {
    return /\d\d:\d\d/.test(s);
}

function isPrice(s) {
    return /CHF [\d\.]+/.test(s);
}

function parsePrice(s) {
    return Number(s.match(/CHF ([\d\.]+)/)[1]);
}

function resolveLocation(name) {
    var cached = locations[name];
    if (cached) {
        return of(cached);
    } else {
        const url = "https://transport.opendata.ch/v1/locations?query=" + encodeURIComponent(name);
        return Axios.get(url).pipe(
            concatMap(location => from(location.data.stations)),
            take(1),
            tap(location => { locations[name] = location })
        )
    }
}

function zone(name) {
    var result = zones[name];
    if (result == null) {
        var candidates = Object.entries(zones)
            .filter(entry => name.startsWith(entry[0]))
            .map(entry => entry[1]);
        if (candidates.length > 0) {
            result = candidates[0]
        } else {
            result = undefined;
        }
    }
    return result;
}

function buildTravel(items) {
    return {
        month: items[0].month,
        from: {
            time: items[0].text,
            location: { name: items[1].text }
        },
        to: {
            time: items[3].text,
            location: { name: items[2].text }
        },
        price: parsePrice(items[5].text),
        zone: zone(items[1].text) == zone(items[2].text) ? zone(items[1].text) : "Other"
    }
}

function csv(data) {
    return concat(of("year;month;zone;from;to;price"),
        from(data).pipe(
            map(travel => travel.month.split("-").join(";") + ";" + travel.zone + ";" + travel.from.location.name+";"+travel.to.location.name+";"+travel.price)
        )).pipe(
            toArray(),
            map(arr => arr.join("\n"))
        )
}

var texts = scanSource().pipe(
    concatMap(parseFile),
    concatMap(file => from(file.doc.Pages).pipe(
        concatMap(page => page.Texts),
        concatMap(text => text.R),
        concatMap(r => of(decodeURIComponent(r.T).trim())),
        map(text => ({ month: extractMonth(file.path), text })))),
    share()
)

texts.pipe(
    buffer(
        texts.pipe(
            filter(item => isPrice(item.text))
        )
    ),
    map(buffer => buffer.slice(-6)),
    filter(buffer => isTimestamp(buffer[0].text)),
    map(buildTravel),
    concatMap(travel => resolveLocation(travel.from.location.name).pipe(
        map(location => (travel.from.location.coordinates = location.coordinate, travel))
    )),
    concatMap(travel => resolveLocation(travel.to.location.name).pipe(
        map(location => (travel.to.location.coordinates = location.coordinate, travel))
    )),
    toArray(),
    tap(result => fs.writeFileSync(path.join(cachePath, "output.json"), JSON.stringify(result, null, 2))),
    concatMap(csv),
    tap(result => fs.writeFileSync(path.join(cachePath, "output.csv"), result))
).subscribe({ complete: () => fs.writeFileSync(locationCacheFile, JSON.stringify(locations, null, 2)) });
