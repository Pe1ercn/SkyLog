import 'leaflet/dist/leaflet.css';
import './styles/base.css';
import './styles/components.css';
import './styles/glass.css';
import './styles/pages.css';
import './styles/map.css';
import './styles/import.css';
import './styles/detail.css';
import './styles/animations.css';
import { createApp } from './app.js';

const root = document.getElementById('app');
createApp(root);
