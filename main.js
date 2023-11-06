import Map from 'https://cdn.skypack.dev/ol/Map.js';
import View from 'https://cdn.skypack.dev/ol/View.js';
import Feature from 'https://cdn.skypack.dev/ol/Feature.js';
import LineString from 'https://cdn.skypack.dev/ol/geom/LineString.js';
import TileLayer from 'https://cdn.skypack.dev/ol/layer/Tile.js';
import Vector from 'https://cdn.skypack.dev/ol/layer/Vector.js';
import SourceVector from 'https://cdn.skypack.dev/ol/source/Vector.js';
import OSM from 'https://cdn.skypack.dev/ol/source/OSM.js';
import { fromLonLat } from 'https://cdn.skypack.dev/ol/proj.js';
import Style from 'https://cdn.skypack.dev/ol/style/Style.js';
import Stroke from 'https://cdn.skypack.dev/ol/style/Stroke.js';
import data from './cache/output.json' assert { type: 'json' };

const map = new Map({
  target: 'map',
  layers: [
    new TileLayer({
      source: new OSM()
    })
  ],
  view: new View({
    center: fromLonLat([7.12, 46.92]),
    zoom: 11,
  }),
});

map.on('postcompose', function (e) {
  document.querySelector('canvas').style.filter = "grayscale(80%) contrast(60%)";
});

var lineStyle =
{
  "2021": [
    new Style({
      stroke: new Stroke({
        color: '#cc11cc60',
        width: 3
      })
    })
  ],
  "2022": [
    new Style({
      stroke: new Stroke({
        color: '#11ddcc60',
        width: 3
      })
    })
  ],
  "2023": [
    new Style({
      stroke: new Stroke({
        color: '#cc771160',
        width: 3
      })
    })
  ]
};

data.forEach(trip => {
  if (!trip.from.location.coordinates.y || !trip.to.location.coordinates.y) {
    return
  }
  var line = new Vector({
    source: new SourceVector({
      features: [new Feature({
        geometry: new LineString([
          fromLonLat([trip.from.location.coordinates.y, trip.from.location.coordinates.x]),
          fromLonLat([trip.to.location.coordinates.y, trip.to.location.coordinates.x])]),
        name: 'Line',
      })]
    })
  });

  line.setStyle(lineStyle[trip.month.split("-")[0]]);
  map.addLayer(line);
});