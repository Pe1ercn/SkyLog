import L from 'leaflet';
import worldCountries from '../assets/world-countries-50m.json';
import southChinaSea from '../assets/south-china-sea.json';
import { icon } from '../lib/icons.js';
import { getLanguage, t } from '../lib/i18n.js';
import {
  airportCodePrimary,
  airportCodes,
  airportDisplayName,
  dateAt,
  esc,
  formatAltitude,
  formatDistance,
  formatDuration,
  monthDayCN,
  statusClass,
  statusText,
  timeAt,
  weekdayCN,
  zoneLabel,
} from '../lib/format.js';
import { sessionColor } from '../lib/palette.js';
import { routePolyline, splitAtDateline, fitView } from '../../shared/geo.js';

export class MapPage {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.map = null;
    this.layerGroup = null;
    this.panelEl = null;
    this.stageEl = null;
    this.controlsEl = null;
    this.waypointMarkers = [];
    this.initialFitDone = false;
    this.animFrame = null;
    this.currentZoom = 2;
    this.bound = false;
  }

  mount() {
    this.root.innerHTML = `<div class="map-page">
      <header class="map-header">
        <div class="map-heading">
          <p class="eyebrow">WORLD MAP</p>
          <h1>飞行地图</h1>
          <p class="page-sub" id="map-sub">把航路装进世界地图里。</p>
        </div>
        <div class="head-actions">
          <button class="btn btn-secondary" type="button" data-action="map-log">${icon('book', 17)}<span>飞行日志</span></button>
          <button class="btn btn-primary" type="button" data-action="map-import">${icon('plus', 17)}<span>导入计划</span></button>
        </div>
      </header>
      <div class="map-stage" id="map-stage">
        <div class="map-canvas" id="map-canvas" aria-label="世界航路地图"></div>
        <aside class="map-panel" id="map-panel" aria-label="当前航段"></aside>
        <div class="map-controls">
          <button class="map-control" type="button" data-map-action="zoom-in" aria-label="放大">${icon('plus', 18)}</button>
          <button class="map-control" type="button" data-map-action="zoom-out" aria-label="缩小">${icon('minus', 18)}</button>
          <button class="map-control" type="button" data-map-action="fit" aria-label="适应航路">${icon('crosshair', 18)}</button>
        </div>
        <div class="map-legend" id="map-legend"></div>
      </div>
    </div>`;
    this.stageEl = this.root.querySelector('#map-stage');
    this.panelEl = this.root.querySelector('#map-panel');
    this.canvasEl = this.root.querySelector('#map-canvas');
    this.bindStatic();
    this.renderPanel();
  }

  bindStatic() {
    if (this.bound) return;
    this.bound = true;
    this.root.querySelector('[data-action="map-import"]')?.addEventListener('click', () => this.app.openImport());
    this.root.querySelector('[data-action="map-log"]')?.addEventListener('click', () => this.app.navigate('log'));
    this.root.querySelectorAll('[data-map-action]').forEach((button) => {
      button.addEventListener('click', () => {
        if (!this.map) return;
        if (button.dataset.mapAction === 'zoom-in') this.map.zoomIn();
        else if (button.dataset.mapAction === 'zoom-out') this.map.zoomOut();
        else this.fitActive();
      });
    });
    this.panelEl?.addEventListener('click', (event) => this.handlePanelClick(event));
    this.panelEl?.addEventListener('change', (event) => this.handlePanelChange(event));
    window.addEventListener('resize', () => this.map?.invalidateSize());
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize());
      this.resizeObserver.observe(this.stageEl);
    }
  }

  show() {
    requestAnimationFrame(() => {
      this.ensureMap();
      this.map?.invalidateSize();
      this.countryLabelRank = null;
      this.updateCountryLabels();
      this.updateSeaLabels();
      this.renderPanel();
      this.renderLayers(this.app.activeFlight(), { animate: !this.initialFitDone });
      if (!this.initialFitDone) {
        this.initialFitDone = true;
        setTimeout(() => this.fitActive(), 80);
      }
    });
  }

  update(options = {}) {
    this.renderPanel();
    if (this.map) {
      this.renderLayers(this.app.activeFlight(), { animate: !options.silent });
      this.renderLegend(this.app.activeFlight());
    }
  }

  ensureMap() {
    if (this.map) return;
    this.map = L.map(this.canvasEl, {
      zoomControl: false,
      attributionControl: true,
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: 9,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      preferCanvas: true,
    });
    this.map.attributionControl.setPrefix(false);
    this.map.attributionControl.addAttribution('Natural Earth');
    this.map.setView([25, 5], 2, { animate: false });

    this.map.createPane('sky-base');
    this.map.getPane('sky-base').style.zIndex = '150';
    this.map.createPane('sky-graticule');
    this.map.getPane('sky-graticule').style.zIndex = '160';
    this.map.createPane('sky-labels');
    this.map.getPane('sky-labels').style.zIndex = '170';
    this.map.createPane('sky-sea');
    this.map.getPane('sky-sea').style.zIndex = '165';

    this.baseLayer = L.geoJSON(worldCountries, {
      pane: 'sky-base',
      interactive: false,
      smoothFactor: 1,
      style: {
        color: '#d6e3f2',
        weight: 0.65,
        fillColor: '#fbfdff',
        fillOpacity: 1,
      },
    }).addTo(this.map);

    const graticule = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      graticule.push(
        L.polyline(
          [
            [lat, -180],
            [lat, 180],
          ],
          {
            pane: 'sky-graticule',
            color: '#c4d6ea',
            weight: 0.55,
            opacity: 0.62,
            interactive: false,
            dashArray: lat === 0 ? '5 5' : null,
          },
        ),
      );
    }
    for (let lon = -150; lon <= 150; lon += 30) {
      graticule.push(
        L.polyline(
          [
            [-85, lon],
            [85, lon],
          ],
          {
            pane: 'sky-graticule',
            color: '#c4d6ea',
            weight: 0.5,
            opacity: 0.42,
            interactive: false,
          },
        ),
      );
    }
    this.graticuleLayer = L.layerGroup(graticule).addTo(this.map);
    this.seaLineLayer = L.layerGroup().addTo(this.map);
    for (const segment of southChinaSea.nineDash || []) {
      L.polyline(
        segment.map(([lon, lat]) => [lat, lon]),
        {
          pane: 'sky-sea',
          color: '#6f9fe8',
          weight: 1.35,
          opacity: 0.72,
          dashArray: '4 7',
          interactive: false,
        },
      ).addTo(this.seaLineLayer);
    }
    this.seaMarkLayer = L.layerGroup().addTo(this.map);
    for (const island of southChinaSea.islands || []) {
      L.circleMarker([island.lat, island.lon], {
        pane: 'sky-sea',
        radius: 2.4,
        color: '#2f6df6',
        weight: 1,
        fillColor: '#2f6df6',
        fillOpacity: 0.78,
        interactive: false,
      }).addTo(this.seaMarkLayer);
    }
    this.seaLabelLayer = L.layerGroup().addTo(this.map);
    this.countryLabelLayer = L.layerGroup().addTo(this.map);
    this.countryLabelRank = null;

    this.layerGroup = L.layerGroup().addTo(this.map);
    this.map.on('zoomend', () => {
      this.currentZoom = this.map.getZoom();
      this.stageEl.classList.toggle('is-low-zoom', this.currentZoom < 4);
      this.stageEl.classList.toggle('is-high-zoom', this.currentZoom >= 7);
      this.updateWaypointLabels();
      this.updateCountryLabels();
      this.updateSeaLabels();
    });
    if (typeof L.control.scale === 'function') {
      L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 130 }).addTo(this.map);
    }
    this.currentZoom = this.map.getZoom();
    this.stageEl.classList.toggle('is-low-zoom', this.currentZoom < 4);
    this.updateCountryLabels();
    this.updateSeaLabels();
  }

  updateSeaLabels() {
    if (!this.map || !this.seaLabelLayer) return;
    const zoom = this.map.getZoom();
    this.seaLabelLayer.clearLayers();
    const addLabel = (name, lat, lon, className = '') => {
      L.marker([lat, lon], {
        pane: 'sky-labels',
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: `country-label-marker ${className}`,
          html: `<span>${esc(name)}</span>`,
          iconSize: [1, 1],
          iconAnchor: [0, 0],
        }),
      }).addTo(this.seaLabelLayer);
    };
    for (const label of southChinaSea.labels || []) {
      if (zoom < Number(label.minZoom || 3)) continue;
      addLabel(t(label.name, label.name_en), label.lat, label.lon, 'is-sea');
    }
    if (zoom >= 4) {
      for (const island of southChinaSea.islands || []) {
        addLabel(t(island.name, island.name_en), island.lat, island.lon, 'is-island');
      }
    }
  }

  updateCountryLabels() {
    if (!this.map || !this.countryLabelLayer) return;
    const zoom = this.map.getZoom();
    const rank = zoom >= 6 ? 5 : zoom >= 5 ? 4 : zoom >= 4 ? 3 : zoom >= 3 ? 2 : 0;
    if (this.countryLabelRank === rank) return;
    this.countryLabelRank = rank;
    this.countryLabelLayer.clearLayers();
    if (!rank) return;
    for (const featureItem of worldCountries.features || []) {
      const properties = featureItem.properties || {};
      const labelRank = Number(properties.LABELRANK);
      if (!Number.isFinite(labelRank) || labelRank > rank) continue;
      const lat = Number(properties.LABEL_Y);
      const lon = Number(properties.LABEL_X);
      const localized = getLanguage() === 'zh'
        ? properties.NAME_ZH || properties.NAME
        : properties.NAME;
      const name = String(
        properties.ADMIN === 'China' ? t('中国', 'China') : localized || '',
      ).trim();
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const marker = L.marker([lat, lon], {
        pane: 'sky-labels',
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: 'country-label-marker',
          html: `<span>${esc(name)}</span>`,
          iconSize: [1, 1],
          iconAnchor: [0, 0],
        }),
      });
      marker.addTo(this.countryLabelLayer);
    }
  }

  activePoints(flight) {
    if (!flight) return [];
    if (Array.isArray(flight.waypoints) && flight.waypoints.length >= 2) return flight.waypoints;
    if (flight.origin?.lat != null && flight.destination?.lat != null) {
      return [
        { lat: flight.origin.lat, lon: flight.origin.lon },
        { lat: flight.destination.lat, lon: flight.destination.lon },
      ];
    }
    return [];
  }

  renderLayers(flight, options = {}) {
    if (!this.map || !this.layerGroup) return;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.animFrame = null;
    this.layerGroup.clearLayers();
    this.waypointMarkers = [];
    const settings = this.app.settings;
    const animate = Boolean(options.animate) && settings.animations !== false &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (settings.showAllFlights) {
      const ordered = [...this.app.flights].sort(
        (a, b) => (a.scheduledOut || 0) - (b.scheduledOut || 0),
      );
      for (const item of ordered) {
        if (flight && item.id === flight.id) continue;
        this.addRoute(item, {
          color: '#8fa6c1',
          weight: 1.7,
          opacity: item.status === 'flown' ? 0.42 : 0.3,
          dashArray: item.status === 'flown' ? null : '4 5',
          interactive: true,
          onClick: () => {
            this.app.state.activeFlightId = item.id;
            this.update();
            this.fitActive();
          },
          tooltip: `${item.callsign || item.flightNumber} · ${item.origin?.iata || item.origin?.icao} → ${item.destination?.iata || item.destination?.icao}`,
        });
      }
    }

    if (flight) {
      this.addRoute(flight, {
        color: sessionColor(flight.colorIndex),
        weight: 3.2,
        opacity: 1,
        dashArray: null,
        glow: true,
        interactive: true,
        animate,
        onClick: () => {
          if (this.app.state.activeFlightId !== flight.id) {
            this.app.state.activeFlightId = flight.id;
            this.update();
            this.fitActive();
          } else {
            this.app.openFlightDetail(flight.id);
          }
        },
      });
      this.addAirport(flight.origin, 'origin', flight);
      this.addAirport(flight.destination, 'destination', flight);
      if (settings.showAlternates) {
        for (const alternate of flight.alternates || []) {
          if (alternate.lat == null || alternate.lon == null) continue;
          this.addAirport(alternate, 'alternate', flight);
        }
      }
      if (settings.showWaypoints && settings.routeMode !== 'direct') this.addWaypoints(flight);
    }
    this.renderLegend(flight);
    this.updateWaypointLabels();
  }

  addRoute(flight, options) {
    const points = this.activePoints(flight);
    if (points.length < 2) return;
    const mode = this.app.settings.routeMode === 'direct' ? 'direct' : 'waypoints';
    const polyline = routePolyline(points, mode, 45);
    if (polyline.length < 2) return;
    const parts = splitAtDateline(polyline);
    const routeOptions = {
      color: options.color,
      weight: options.weight,
      opacity: options.opacity,
      lineCap: 'round',
      lineJoin: 'round',
      dashArray: options.dashArray || null,
      interactive: options.interactive !== false,
      bubblingMouseEvents: false,
      className: 'route-line',
    };
    if (options.glow) {
      for (const part of parts) {
        L.polyline(part, {
          color: options.color,
          weight: options.weight + 9,
          opacity: 0.12,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
          className: 'route-glow',
        }).addTo(this.layerGroup);
      }
    }
    if (!options.animate || parts.length !== 1) {
      for (const part of parts) {
        const line = L.polyline(part, routeOptions).addTo(this.layerGroup);
        if (options.tooltip) line.bindTooltip(options.tooltip, { sticky: true, className: 'route-tooltip' });
        if (options.onClick) line.on('click', options.onClick);
      }
      return;
    }
    const full = parts[0];
    const line = L.polyline([full[0], full[0]], routeOptions).addTo(this.layerGroup);
    if (options.onClick) line.on('click', options.onClick);
    if (options.tooltip) line.bindTooltip(options.tooltip, { sticky: true, className: 'route-tooltip' });
    const start = performance.now();
    const duration = 950;
    const total = full.length;
    const step = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const count = Math.max(2, Math.ceil(total * eased));
      line.setLatLngs(full.slice(0, count));
      if (progress < 1) {
        this.animFrame = requestAnimationFrame(step);
      } else {
        line.setLatLngs(full);
        this.animFrame = null;
      }
    };
    this.animFrame = requestAnimationFrame(step);
  }

  addAirport(airport, role, flight) {
    if (airport?.lat == null || airport?.lon == null) return;
    const labelMode = this.app.settings.labelMode || 'both';
    const name = airportDisplayName(airport.name, airportCodePrimary(airport));
    const icao = String(airport.icao || '').toUpperCase();
    const iata = String(airport.iata || '').toUpperCase();
    let labelHtml = '';
    if (labelMode === 'name') {
      labelHtml = `<b class="is-name">${esc(name)}</b>`;
    } else if (labelMode === 'codes') {
      labelHtml = `<b>${esc(icao)}</b>${iata ? `<span>${esc(iata)}</span>` : ''}`;
    } else {
      labelHtml = `<b>${esc(icao || iata)}</b>${iata && icao ? `<span>${esc(iata)}</span>` : ''}<em>${esc(name)}</em>`;
    }
    const marker = L.marker([airport.lat, airport.lon], {
      icon: L.divIcon({
        className: `map-airport-marker is-${role}`,
        html: `<span class="map-airport-dot"></span><span class="map-airport-label">${labelHtml}</span>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      }),
      keyboard: true,
      title: `${airportCodes(airport)} · ${name}`,
      riseOnHover: true,
      zIndexOffset: role === 'alternate' ? 300 : 600,
    });
    marker.addTo(this.layerGroup);
    marker.on('click', () => {
      this.app.openAirportDetail({ flightId: flight.id, icao: airport.icao, airport });
    });
    marker.bindTooltip(`${airportCodes(airport)} · ${name}`, {
      direction: 'top',
      offset: [0, -10],
      className: 'airport-tooltip',
    });
  }

  addWaypoints(flight) {
    const points = this.activePoints(flight);
    if (!Array.isArray(points) || points.length < 3) return;
    const zoom = this.map?.getZoom() || 2;
    for (let index = 1; index < points.length - 1; index += 1) {
      const waypoint = points[index];
      if (!waypoint || waypoint.lat == null || waypoint.lon == null) continue;
      const marker = L.circleMarker([waypoint.lat, waypoint.lon], {
        radius: 3.2,
        color: '#ffffff',
        weight: 1.4,
        fillColor: sessionColor(flight.colorIndex),
        fillOpacity: 0.92,
        opacity: 1,
        interactive: true,
        bubblingMouseEvents: false,
        className: 'waypoint-dot',
      }).addTo(this.layerGroup);
      marker._waypointIdent = waypoint.ident;
      marker.bindTooltip(waypoint.ident || '', {
        direction: 'top',
        offset: [0, -5],
        className: 'waypoint-tooltip',
      });
      marker.on('click', () => {
        this.app.openFlightDetail(flight.id, { tab: 'route' });
      });
      this.waypointMarkers.push(marker);
    }
    if (zoom >= 7) this.updateWaypointLabels();
  }

  updateWaypointLabels() {
    if (!this.map) return;
    const shouldLabel = this.app.settings.showWaypoints && this.map.getZoom() >= 7;
    for (const marker of this.waypointMarkers) {
      if (shouldLabel && marker._waypointLabel !== true) {
        marker.unbindTooltip();
        marker.bindTooltip(marker._waypointIdent || '', {
          permanent: true,
          direction: 'right',
          offset: [4, 0],
          className: 'waypoint-label',
        });
        marker._waypointLabel = true;
      } else if (!shouldLabel && marker._waypointLabel === true) {
        marker.unbindTooltip();
        marker.bindTooltip(marker._waypointIdent || '', {
          direction: 'top',
          offset: [0, -5],
          className: 'waypoint-tooltip',
        });
        marker._waypointLabel = false;
      }
    }
  }

  renderPanel() {
    if (!this.panelEl) return;
    const flight = this.app.activeFlight();
    const settings = this.app.settings;
    if (!flight) {
      this.panelEl.innerHTML = `<div class="map-panel-empty">
        <span class="map-panel-eyebrow">NO FLIGHT SELECTED</span>
        <div class="map-empty-art">${icon('globe', 26)}</div>
        <h2>地图还没有航段</h2>
        <p>从 SimBrief 读取一份计划，或从飞行日志里选择一段航程。</p>
        <button class="btn btn-primary btn-block" type="button" data-panel-action="import">${icon('plus', 16)} 导入第一份计划</button>
        <button class="text-btn" type="button" data-panel-action="log">打开飞行日志 ${icon('arrowRight', 14)}</button>
      </div>`;
      return;
    }
    const origin = flight.origin;
    const destination = flight.destination;
    const routeMode = settings.routeMode || 'waypoints';
    const sessions = this.app.sessionsSorted();
    const sessionOptions = sessions
      .map((session) => {
        const flights = this.app.flightsForSession(session.id);
        return `<optgroup label="${esc(session.name)}">${flights
          .map(
            (item) =>
              `<option value="${esc(item.id)}" ${item.id === flight.id ? 'selected' : ''}>${esc(item.callsign || item.flightNumber)} · ${esc(item.origin?.iata || item.origin?.icao)} → ${esc(item.destination?.iata || item.destination?.icao)}</option>`,
          )
          .join('')}</optgroup>`;
      })
      .join('');
    const dateLabel = flight.scheduledOut
      ? `${monthDayCN(settings.timeMode === 'utc' ? dateAt(flight.scheduledOut, 0, 'utc') : flight.scheduledDate)} · ${weekdayCN(settings.timeMode === 'utc' ? dateAt(flight.scheduledOut, 0, 'utc') : flight.scheduledDate)}`
      : '日期待定';
    const departure = flight.scheduledOut
      ? timeAt(flight.scheduledOut, origin?.timezoneHours || 0, settings.timeMode)
      : '—';
    const departureDate = flight.scheduledOut
      ? dateAt(flight.scheduledOut, origin?.timezoneHours || 0, settings.timeMode)
      : '';
    const arrivalDate = flight.scheduledIn
      ? dateAt(flight.scheduledIn, destination?.timezoneHours || 0, settings.timeMode)
      : '';
    const arrival = flight.scheduledIn
      ? timeAt(flight.scheduledIn, destination?.timezoneHours || 0, settings.timeMode)
      : '—';
    const arrivalPrefix = arrivalDate && arrivalDate !== departureDate ? `${monthDayCN(arrivalDate)} ` : '';
    const warnings = Array.isArray(flight.warnings) ? flight.warnings : [];
    this.panelEl.innerHTML = `<div class="map-panel-inner">
      <div class="map-panel-head">
        <span class="map-panel-eyebrow">ACTIVE LEG</span>
        <span class="status-chip ${statusClass(flight.status)}"><i></i>${statusText(flight.status)}</span>
      </div>
      <div class="map-flight-picker">
        <select aria-label="选择航段" data-panel-action="select-flight">${sessionOptions}</select>
        ${icon('chevronDown', 14)}
      </div>
      <div class="map-route">
        <div class="map-route-airport">
          <span class="map-code">${esc(airportCodePrimary(origin))}</span>
          <span class="map-iata">${esc(origin?.iata || '—')}</span>
        </div>
        <div class="map-route-arrow">
          <span></span>
          ${icon('plane', 15)}
        </div>
        <div class="map-route-airport is-arrival">
          <span class="map-code">${esc(airportCodePrimary(destination))}</span>
          <span class="map-iata">${esc(destination?.iata || '—')}</span>
        </div>
      </div>
      <div class="map-names">
        <span>${esc(airportDisplayName(origin?.name, '起飞机场'))}</span>
        ${icon('arrowRight', 12)}
        <span>${esc(airportDisplayName(destination?.name, '到达机场'))}</span>
      </div>
      <div class="map-flight-meta">
        <span>${esc(flight.flightNumber || flight.callsign || '—')}</span>
        <i></i>
        <span>${esc(flight.aircraft?.name || flight.aircraft?.icao || '—')}</span>
        ${flight.registration && flight.registration !== (flight.flightNumber || flight.callsign) ? `<i></i><span>${esc(flight.registration)}</span>` : ''}
      </div>
      <div class="map-metrics">
        <div><span>距离</span><strong>${esc(formatDistance(flight.distanceNm, settings.distanceUnit))}</strong></div>
        <div><span>巡航</span><strong>${esc(formatAltitude(flight.cruiseAltitudeFt, settings.altitudeUnit, { flightLevel: true }))}</strong></div>
        <div><span>计划时间</span><strong>${esc(formatDuration(flight.blockMinutes, 'compact'))}</strong></div>
        <div><span>航点</span><strong>${flight.waypointCount || 0}<em>个</em></strong></div>
      </div>
      <div class="map-time-row">
        <div><span>${esc(dateLabel)}</span><strong>${esc(departure)} <em>${esc(zoneLabel(origin?.timezoneHours, settings.timeMode))}</em></strong></div>
        <div class="is-arrival"><span>预计到达</span><strong>${esc(arrivalPrefix)}${esc(arrival)} <em>${esc(zoneLabel(destination?.timezoneHours, settings.timeMode))}</em></strong></div>
      </div>
      ${warnings.length ? `<div class="map-warning">${icon('alert', 14)}<span>${esc(warnings[0])}</span></div>` : ''}
      <div class="map-options">
        <div class="map-option-label">航线显示</div>
        <div class="segmented segmented-small">
          <button type="button" class="${routeMode === 'waypoints' ? 'is-active' : ''}" data-panel-action="route-mode" data-value="waypoints">航点连线</button>
          <button type="button" class="${routeMode === 'direct' ? 'is-active' : ''}" data-panel-action="route-mode" data-value="direct">起降直连</button>
        </div>
        <div class="map-toggle-row">
          <button class="mini-toggle ${settings.showWaypoints ? 'is-on' : ''}" type="button" data-panel-action="toggle" data-key="showWaypoints"><span></span>航点</button>
          <button class="mini-toggle ${settings.showAlternates ? 'is-on' : ''}" type="button" data-panel-action="toggle" data-key="showAlternates"><span></span>备降场</button>
          <button class="mini-toggle ${settings.showAllFlights ? 'is-on' : ''}" type="button" data-panel-action="toggle" data-key="showAllFlights"><span></span>全部航班</button>
        </div>
      </div>
      <div class="map-panel-actions">
        <button class="btn btn-primary btn-block" type="button" data-panel-action="detail">${icon('file', 16)} 查看完整详情</button>
      </div>
    </div>`;
    this.renderLegend(flight);
  }

  renderLegend(flight) {
    const legend = this.root.querySelector('#map-legend');
    if (!legend) return;
    if (!flight) {
      legend.innerHTML = '';
      legend.hidden = true;
      return;
    }
    legend.hidden = false;
    legend.innerHTML = `<span><i class="legend-line is-active" style="--legend-color:${sessionColor(flight.colorIndex)}"></i>${esc(flight.callsign || flight.flightNumber)}</span>
      ${this.app.settings.showAllFlights ? `<span><i class="legend-line is-other"></i>其它航段</span>` : ''}
      <span><i class="legend-line is-sea"></i>${t('九段线', 'Nine-dash line')}</span>
      <span><i class="legend-dot is-origin"></i>起飞机场</span>
      <span><i class="legend-dot is-destination"></i>到达机场</span>
      ${this.app.settings.showWaypoints && this.app.settings.routeMode !== 'direct' ? `<span><i class="legend-dot is-waypoint"></i>航点</span>` : ''}`;
  }

  handlePanelClick(event) {
    const actionEl = event.target.closest('[data-panel-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.panelAction;
    if (action === 'import') this.app.openImport();
    else if (action === 'log') this.app.navigate('log');
    else if (action === 'detail') {
      const flight = this.app.activeFlight();
      if (flight) this.app.openFlightDetail(flight.id);
    } else if (action === 'route-mode') {
      const value = actionEl.dataset.value;
      if (value && value !== this.app.settings.routeMode) {
        this.app.updateSettings({ routeMode: value });
      }
    } else if (action === 'toggle') {
      const key = actionEl.dataset.key;
      if (key) {
        this.app.updateSettings({ [key]: !this.app.settings[key] }).then(() => {
          if (key === 'showAllFlights') this.fitActive();
        });
      }
    }
  }

  handlePanelChange(event) {
    const select = event.target.closest('[data-panel-action="select-flight"]');
    if (!select) return;
    this.app.state.activeFlightId = select.value;
    this.renderPanel();
    this.renderLayers(this.app.activeFlight(), { animate: true });
    this.fitActive();
  }

  fitActive() {
    if (!this.map) return;
    const active = this.app.activeFlight();
    const points = active ? this.activePoints(active) : [];
    if (!points.length) {
      this.map.setView([25, 5], 2, { animate: true });
      return;
    }
    const lons = points.map((point) => Number(point.lon));
    const lonSpan = Math.max(...lons) - Math.min(...lons);
    if (lonSpan > 180) {
      const view = fitView(points);
      this.map.setView([view.center.lat, view.center.lon], view.zoom, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lon]));
    const panelWidth = window.innerWidth > 1180 ? 420 : 360;
    this.map.fitBounds(bounds, {
      paddingTopLeft: [panelWidth + 105, 90],
      paddingBottomRight: [225, 95],
      maxZoom: 7,
      animate: true,
      duration: 0.7,
    });
  }
}
