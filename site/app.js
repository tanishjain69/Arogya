// Arogya Prototype – Single Page App logic
// Sections: Booking (home), Tracking, AI Seek, Forum

// Router (hash-based)
const routes = ["home", "track", "ai", "forum"];
function setRoute(hash) {
  const route = (hash || "#home").replace(/^#/, "");
  routes.forEach(r => {
    document.getElementById(r)?.classList.toggle("active", r === route);
    document.querySelectorAll(`a[data-route][href='#${r}']`).forEach(a => a.classList.toggle("active", r === route));
  });
}
window.addEventListener("hashchange", () => setRoute(location.hash));
setRoute(location.hash);

// Ensure body has enough top padding to avoid content being covered by the fixed header
function adjustForFixedHeader() {
  const header = document.querySelector('.header');
  if (!header) return;
  const h = header.offsetHeight;
  document.body.style.paddingTop = `${h}px`;
}
window.addEventListener('load', adjustForFixedHeader);
window.addEventListener('resize', adjustForFixedHeader);
window.addEventListener('hashchange', adjustForFixedHeader);

// Simple MapRenderer using OpenStreetMap tiles (no external JS library)
function createMapRenderer(containerId, center = { lat: 22.5726, lng: 88.3639 }, zoom = 14) {
  const container = document.getElementById(containerId);
  container.style.position = "relative";
  container.style.overflow = "hidden";
  const TILE = 256;
  const z = zoom;
  const worldSize = TILE * Math.pow(2, z);

  function lngToX(lng) { return ((lng + 180) / 360) * worldSize; }
  function latToY(lat) {
    const latRad = (lat * Math.PI) / 180;
    return ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * worldSize;
  }
  function xToLng(x) { return (x / worldSize) * 360 - 180; }
  function yToLat(y) {
    const n = Math.PI - 2 * Math.PI * (y / worldSize);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  // Determine center tile and draw a 3x3 grid
  function drawTiles() {
    container.innerHTML = "";
    const cx = lngToX(center.lng);
    const cy = latToY(center.lat);
    const centerTileX = Math.floor(cx / TILE);
    const centerTileY = Math.floor(cy / TILE);
    const startX = centerTileX - 1;
    const startY = centerTileY - 1;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const x = startX + i;
        const y = startY + j;
        const img = document.createElement("img");
        img.src = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
        img.style.position = "absolute";
        img.style.left = `${(i - 1) * TILE + container.clientWidth / 2 - (cx % TILE)}px`;
        img.style.top = `${(j - 1) * TILE + container.clientHeight / 2 - (cy % TILE)}px`;
        img.style.width = `${TILE}px`;
        img.style.height = `${TILE}px`;
        container.appendChild(img);
      }
    }
  }

  const markers = new Map();
  function addMarker(id, lat, lng, label) {
    const el = document.createElement("div");
    el.className = "marker";
    el.style.position = "absolute";
    el.style.width = "16px";
    el.style.height = "16px";
    el.style.borderRadius = "50%";
    el.style.background = "#d32f2f";
    el.style.border = "2px solid #fff";
    el.title = label || id;
    container.appendChild(el);
    markers.set(id, { el, lat, lng });
    positionMarker(id);
  }
  function updateMarker(id, lat, lng) {
    const m = markers.get(id);
    if (!m) return;
    m.lat = lat; m.lng = lng;
    positionMarker(id);
  }
  function positionMarker(id) {
    const m = markers.get(id);
    const px = lngToX(m.lng); const py = latToY(m.lat);
    const cx = lngToX(center.lng); const cy = latToY(center.lat);
    const left = container.clientWidth / 2 + (px - cx) - 8;
    const top = container.clientHeight / 2 + (py - cy) - 8;
    m.el.style.left = `${left}px`;
    m.el.style.top = `${top}px`;
  }
  function setCenter(lat, lng) { center = { lat, lng }; drawTiles(); markers.forEach((_, id) => positionMarker(id)); }
  function getCenter() { return center; }
  function clientToLatLng(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    const cx = lngToX(center.lng);
    const cy = latToY(center.lat);
    const x = cx + (clientX - rect.left - container.clientWidth / 2);
    const y = cy + (clientY - rect.top - container.clientHeight / 2);
    return { lat: yToLat(y), lng: xToLng(x) };
  }

  drawTiles();
  window.addEventListener("resize", () => { drawTiles(); markers.forEach((_, id) => positionMarker(id)); });

  return { addMarker, updateMarker, setCenter, getCenter, clientToLatLng };
}

// Globals
let map, pickupMarkerId = "pickup";
let pickupLatLng = null; // store actual pickup coordinates
let nearbyAmbulances = [];
let selectedQuote = null;
let trackMap, trackTimer = null;

// Fleet simulation (Kolkata)
const FLEET = (() => {
  const base = [
    { id: "AMB-101", type: "BLS", lat: 22.5726, lng: 88.3639, baseFare: 150, perKm: 25, speedKmph: 40 }, // Esplanade
    { id: "AMB-245", type: "ALS", lat: 22.5695, lng: 88.4325, baseFare: 300, perKm: 40, speedKmph: 50 }, // Salt Lake
    { id: "AMB-312", type: "BLS", lat: 22.5015, lng: 88.3687, baseFare: 150, perKm: 25, speedKmph: 42 }, // Tollygunge
    { id: "AMB-478", type: "ALS", lat: 22.5200, lng: 88.3870, baseFare: 300, perKm: 40, speedKmph: 48 }, // Alipore
    { id: "MORT-21", type: "Mortuary", lat: 22.5400, lng: 88.3700, baseFare: 500, perKm: 35, speedKmph: 35 }, // Bhawanipur
  ];
  return base;
})();

// Fake driver profiles for demo (investor/user preview)
const FAKE_DRIVERS = [
  { name: "Rahul Sen", phone: "9876543210" },
  { name: "Priya Das", phone: "9890012345" },
  { name: "Amit Roy", phone: "9123456789" },
  { name: "Sneha Gupta", phone: "9812345678" },
  { name: "Arjun Kumar", phone: "9911223344" },
];

function pickFakeDriver() {
  const i = Math.floor(Math.random() * FAKE_DRIVERS.length);
  return FAKE_DRIVERS[i];
}

function generateVehicleReg(id) {
  // Create a plausible WB registration number deterministically from vehicle id
  const digits = parseInt(String(id).replace(/\D/g, "")) || Math.floor(Math.random() * 10000);
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const district = String(digits % 99).padStart(2, "0");
  const a1 = letters[digits % 26];
  const a2 = letters[(digits * 7) % 26];
  const serial = String((digits * 13) % 9999).padStart(4, "0");
  return `WB ${district}${a1}${a2} ${serial}`;
}

// Kolkata facilities for destination suggestions (loaded from facilities.json, fallback to defaults)
let FACILITIES = [];
const DEFAULT_FACILITIES = [
  { name: "SSKM Hospital (IPGMER)", type: "Government Hospital", area: "Alipore/Bhawanipore", lat: 22.5380, lng: 88.3538, alt: ["SSKM", "IPGMER", "PG"], pop: 10 },
  { name: "NRS Medical College & Hospital", type: "Government Hospital", area: "Sealdah", lat: 22.5643, lng: 88.3680, alt: ["NRS"], pop: 9 },
  { name: "R. G. Kar Medical College & Hospital", type: "Government Hospital", area: "Belgharia/Shyambazar", lat: 22.6018, lng: 88.3928, alt: ["RG Kar", "RGKAR"], pop: 8 },
  { name: "Calcutta National Medical College & Hospital", type: "Government Hospital", area: "Park Circus", lat: 22.5586, lng: 88.3737, alt: ["CNMC"], pop: 7 },
  { name: "M. R. Bangur Hospital", type: "Government Hospital", area: "Tollygunge/Jadavpur", lat: 22.4970, lng: 88.3620, alt: ["MR Bangur"], pop: 6 },

  { name: "AMRI Hospital Dhakuria", type: "Private Hospital", area: "Dhakuria", lat: 22.5039, lng: 88.3753, alt: ["AMRI Dhakuria"], pop: 8 },
  { name: "AMRI Hospital Salt Lake", type: "Private Hospital", area: "Salt Lake", lat: 22.5875, lng: 88.4210, alt: ["AMRI Salt Lake"], pop: 7 },
  { name: "AMRI Hospital Mukundapur", type: "Private Hospital", area: "Mukundapur", lat: 22.4930, lng: 88.4060, alt: ["AMRI Mukundapur"], pop: 6 },
  { name: "Fortis Hospital Anandapur", type: "Private Hospital", area: "Anandapur", lat: 22.5204, lng: 88.4191, alt: ["Fortis Anandapur"], pop: 9 },
  { name: "Medica Superspecialty Hospital", type: "Private Hospital", area: "Mukundapur", lat: 22.4955, lng: 88.4014, alt: ["Medica"], pop: 9 },
  { name: "Apollo Gleneagles Multispeciality Hospital", type: "Private Hospital", area: "EM Bypass/Phoolbagan", lat: 22.5721, lng: 88.4105, alt: ["Apollo Gleneagles", "Apollo"], pop: 9 },
  { name: "Ruby General Hospital", type: "Private Hospital", area: "Kasba/EM Bypass", lat: 22.5032, lng: 88.3979, alt: ["Ruby"], pop: 8 },
  { name: "Desun Hospital", type: "Private Hospital", area: "EM Bypass", lat: 22.5035, lng: 88.3697, alt: ["Desun"], pop: 7 },
  { name: "Peerless Hospital", type: "Private Hospital", area: "Naktala/E M Bypass", lat: 22.4847, lng: 88.3899, alt: ["Peerless"], pop: 6 },
  { name: "Woodlands Multispeciality Hospital", type: "Private Hospital", area: "Alipore/Mominpur", lat: 22.5177, lng: 88.3413, alt: ["Woodlands"], pop: 7 },
  { name: "CMRI (Calcutta Medical Research Institute)", type: "Private Hospital", area: "Alipore", lat: 22.5197, lng: 88.3454, alt: ["CMRI"], pop: 7 },
  { name: "Belle Vue Clinic", type: "Private Hospital", area: "Rawdon Street", lat: 22.5472, lng: 88.3564, alt: ["Bellevue"], pop: 7 },
  { name: "Kothari Medical Centre", type: "Private Hospital", area: "Alipore", lat: 22.5180, lng: 88.3518, alt: ["Kothari"], pop: 6 },
  { name: "Bhagirathi Neotia Woman & Child Care Centre", type: "Maternity", area: "Rawdon Street", lat: 22.5630, lng: 88.3503, alt: ["Neotia"], pop: 6 },
  { name: "Institute of Neurosciences Kolkata (INK)", type: "Speciality", area: "Park Circus", lat: 22.5529, lng: 88.3660, alt: ["INK"], pop: 6 },
  { name: "Charnock Hospital", type: "Private Hospital", area: "Jessore Road", lat: 22.6369, lng: 88.4387, alt: ["Charnock"], pop: 5 },
  { name: "Manipal Hospitals Salt Lake (ex Columbia Asia)", type: "Private Hospital", area: "Salt Lake", lat: 22.5906, lng: 88.4147, alt: ["Manipal", "Columbia Asia"], pop: 6 },
  { name: "Tata Medical Center", type: "Cancer Centre", area: "New Town", lat: 22.5599, lng: 88.4883, alt: ["TMC"], pop: 8 },
  { name: "R N Tagore International Institute of Cardiac Sciences", type: "Cardiac", area: "Mukundapur", lat: 22.4982, lng: 88.4098, alt: ["RN Tagore", "Narayana"], pop: 8 },
  { name: "KPC Medical College & Hospital", type: "Teaching Hospital", area: "Jadavpur", lat: 22.4940, lng: 88.3770, alt: ["KPC"], pop: 6 },
  { name: "Ramakrishna Mission Seva Pratishthan (Sishumangal)", type: "Maternity", area: "Kalighat", lat: 22.5163, lng: 88.3451, alt: ["RKMSP", "Sishumangal"], pop: 6 },
  { name: "Ekbalpur Nursing Home", type: "Nursing Home", area: "Ekbalpur", lat: 22.5220, lng: 88.3410, alt: ["Ekbalpur"], pop: 5 },
  { name: "GD Hospital & Diabetes Institute", type: "Speciality", area: "Park Street", lat: 22.5550, lng: 88.3500, alt: ["GD Hospital"], pop: 5 },
  { name: "Susrut Eye Foundation & Research", type: "Eye", area: "Salt Lake", lat: 22.6010, lng: 88.4190, alt: ["Susrut"], pop: 5 },
  { name: "B. P. Poddar Hospital & Medical Research Ltd.", type: "Private Hospital", area: "New Alipore", lat: 22.5775, lng: 88.3615, alt: ["BP Poddar"], pop: 5 },
  { name: "Howrah General Hospital", type: "Government Hospital", area: "Howrah", lat: 22.5890, lng: 88.3210, alt: ["Howrah Hospital"], pop: 4 },
  { name: "Narayana Superspeciality Hospital, Howrah", type: "Private Hospital", area: "Howrah", lat: 22.5950, lng: 88.3220, alt: ["Narayana Howrah"], pop: 5 },
  { name: "Apollo Clinic Salt Lake", type: "Clinic", area: "Salt Lake", lat: 22.5860, lng: 88.4170, alt: ["Apollo Clinic"], pop: 4 },
  { name: "Apollo Clinic New Town", type: "Clinic", area: "New Town", lat: 22.5750, lng: 88.4670, alt: ["Apollo Clinic"], pop: 4 },
  { name: "Calcutta Heart Clinic & Research Institute", type: "Cardiac", area: "Salt Lake", lat: 22.4890, lng: 88.3860, alt: ["Calcutta Heart"], pop: 5 },
  { name: "Park Clinic", type: "Nursing Home", area: "Bhawanipore", lat: 22.5385, lng: 88.3537, alt: ["Park Clinic"], pop: 4 },
  { name: "Nightingale Hospital", type: "Nursing Home", area: "Elgin", lat: 22.5462, lng: 88.3555, alt: ["Nightingale"], pop: 4 }
];

async function loadFacilities() {
  try {
    const res = await fetch("facilities.json");
    if (!res.ok) throw new Error("Facilities list not found");
    const data = await res.json();
    if (Array.isArray(data) && data.length) {
      FACILITIES = data;
      return;
    }
    FACILITIES = DEFAULT_FACILITIES;
  } catch (e) {
    FACILITIES = DEFAULT_FACILITIES;
  }
}

// Utility: distance and ETA
function haversine(a, b) {
  const toRad = d => (d * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.asin(Math.sqrt(h));
  return R * c; // km
}
function estimateFare(distanceKm, vehicle) {
  return Math.round(vehicle.baseFare + distanceKm * vehicle.perKm);
}
function estimateETA(distanceKm, speedKmph) {
  const minutes = Math.ceil((distanceKm / speedKmph) * 60);
  return minutes;
}

// Initialize map for booking
function initMap() {
  map = createMapRenderer("map", { lat: 22.5726, lng: 88.3639 }, 14);
  const mapEl = document.getElementById("map");
  mapEl.addEventListener("click", e => {
    const latlng = map.clientToLatLng(e.clientX, e.clientY);
    setPickup(latlng);
  });
}

async function setPickup(latlng) {
  pickupLatLng = latlng;
  map.setCenter(latlng.lat, latlng.lng);
  map.addMarker(pickupMarkerId, latlng.lat, latlng.lng, "Pickup");
  const pickupEl = document.getElementById("pickup");
  const statusEl = document.getElementById("pickupStatus");
  if (pickupEl) {
    pickupEl.value = "Locating address…";
  } else if (statusEl) {
    statusEl.textContent = "Locating address…";
  }
  try {
    const addr = await reverseGeocode(latlng);
    if (pickupEl) {
      pickupEl.value = addr;
    } else if (statusEl) {
      statusEl.textContent = `Pickup set: ${addr}`;
    }
  } catch (e) {
    if (pickupEl) {
      pickupEl.value = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
    } else if (statusEl) {
      statusEl.textContent = `Pickup set: ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
    }
  }
}

async function reverseGeocode(latlng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latlng.lat}&lon=${latlng.lng}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('Reverse geocoding failed');
  const data = await res.json();
  return data.display_name || `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
}

async function forwardGeocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=1`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) return null;
  const data = await res.json();
  if (Array.isArray(data) && data.length) {
    const a = data[0];
    return { lat: parseFloat(a.lat), lng: parseFloat(a.lon) };
  }
  return null;
}

// Geolocation
async function fetchApproxLocationFallback() {
  // Try multiple HTTPS-friendly providers with CORS
  const providers = [
    async () => {
      const r = await fetch("https://ipapi.co/json/");
      if (!r.ok) throw new Error("ipapi failed");
      const d = await r.json();
      if (d && d.latitude && d.longitude) return { lat: d.latitude, lng: d.longitude, src: "ipapi" };
      throw new Error("ipapi no lat/lon");
    },
    async () => {
      const r = await fetch("https://geolocation-db.com/json/");
      if (!r.ok) throw new Error("geolocation-db failed");
      const d = await r.json();
      if (d && d.latitude && d.longitude && typeof d.latitude === 'number') return { lat: d.latitude, lng: d.longitude, src: "geolocation-db" };
      throw new Error("geolocation-db no lat/lon");
    },
    async () => {
      const r = await fetch("https://ipinfo.io/json");
      if (!r.ok) throw new Error("ipinfo failed");
      const d = await r.json();
      if (d && d.loc) {
        const [lat, lng] = d.loc.split(",").map(parseFloat);
        if (!isNaN(lat) && !isNaN(lng)) return { lat, lng, src: "ipinfo" };
      }
      throw new Error("ipinfo no lat/lon");
    }
  ];
  let lastErr = null;
  for (const p of providers) {
    try { return await p(); } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("Approx location failed");
}

document.getElementById("btnUseLocation").addEventListener("click", async () => {
  const btn = document.getElementById("btnUseLocation");
  btn.disabled = true; btn.textContent = "Locating…";
  const geoOptions = { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 };
  const tryGeo = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation not supported."));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(err),
      geoOptions
    );
  });
  try {
    const latlng = await tryGeo();
    await setPickup(latlng);
  } catch (e) {
    // Fallback: approximate by IP via multiple providers if user denied or GPS failed
    try {
      const approx = await fetchApproxLocationFallback();
      await setPickup({ lat: approx.lat, lng: approx.lng });
      alert("Used approximate location (IP-based). For precise pickup, allow location access in your browser settings and tap 'Use my location' again.");
    } catch (e2) {
      const msg = (e && e.code === 1) ?
        "Location permission denied. Please allow location access (tap the lock icon ▶ Site settings ▶ Allow Location) and try again, or tap the map to set pickup." :
        "Unable to determine location. Please tap the map to set pickup.";
      alert(msg);
    }
  } finally {
    btn.disabled = false; btn.textContent = "Use my location";
  }
});

// Toggle fields based on service type
const serviceTypeEl = document.getElementById("serviceType");
serviceTypeEl.addEventListener("change", () => {
  const v = serviceTypeEl.value;
  const isMortuary = v === "Mortuary";
  // Hide destination field and remove 'required' when Mortuary is selected
  const destGroupEl = document.getElementById("destGroup");
  const destInputEl = document.getElementById("destination");
  if (destGroupEl && destInputEl) {
    destGroupEl.hidden = isMortuary;
    destInputEl.required = !isMortuary;
    if (isMortuary) {
      const destSuggEl = document.getElementById("destSuggestions");
      if (destSuggEl) destSuggEl.innerHTML = "";
    }
  }
});
// Initial destination visibility & requirement
(() => {
  const isMortuaryInit = serviceTypeEl.value === "Mortuary";
  const destGroupEl = document.getElementById("destGroup");
  const destInputEl = document.getElementById("destination");
  if (destGroupEl && destInputEl) {
    destGroupEl.hidden = isMortuaryInit;
    destInputEl.required = !isMortuaryInit;
  }
})();
document.getElementById("bookingForm").addEventListener("reset", () => {
  const isMortuary = serviceTypeEl.value === "Mortuary";
  const destGroupEl = document.getElementById("destGroup");
  const destInputEl = document.getElementById("destination");
  if (destGroupEl && destInputEl) {
    destGroupEl.hidden = isMortuary;
    destInputEl.required = !isMortuary;
  }
});

// Destination suggestions
const destInput = document.getElementById("destination");
const destSugg = document.getElementById("destSuggestions");
let selectedDest = null;
let destActiveIndex = -1;
function facilityScore(f, q) {
  if (!q) return 0;
  const name = f.name.toLowerCase();
  const area = (f.area || "").toLowerCase();
  const tokens = [name, area, ...(f.alt || []).map(a => a.toLowerCase())];
  let score = 0;
  tokens.forEach(t => {
    if (t.startsWith(q)) score += 3;
    else if (t.includes(q)) score += 1;
  });
  score += (f.pop || 0) * 0.1;
  return score;
}
function renderSuggestions(matches, query = "") {
  if (!matches.length) { destSugg.innerHTML = ""; return; }
  const pickup = pickupLatLng;

  // Strategy: keep the best match (by score) as the first suggestion, then rank the rest by proximity/popularity.
  // This ensures the user sees the full destination name at the very top while still surfacing nearby/popular options.
  let top = null;
  let rest = matches;
  if (query) {
    top = matches[0];
    rest = matches.slice(1);
  }

  const restItems = rest.map(m => {
    const dist = pickup ? haversine(pickup, { lat: m.lat, lng: m.lng }) : null;
    return { m, dist };
  }).sort((a, b) => {
    if (a.dist != null && b.dist != null) return a.dist - b.dist;
    return (b.m.pop || 0) - (a.m.pop || 0);
  });

  // Limit total suggestions to 10, counting the top match if present
  const items = [];
  if (top) {
    const topDist = pickup ? haversine(pickup, { lat: top.lat, lng: top.lng }) : null;
    items.push({ m: top, dist: topDist });
  }
  for (const it of restItems) {
    if (items.length >= 10) break;
    items.push(it);
  }

  destSugg.innerHTML = items.map(({ m, dist }, idx) => {
    const meta = [m.type, m.area].filter(Boolean).join(" · ");
    const distStr = dist != null ? ` · ${dist.toFixed(1)} km` : "";
    return `<div class='item' data-index='${idx}' data-name='${m.name}'>
      <div>${m.name}</div>
      <div class='meta'>${meta}${distStr}</div>
    </div>`;
  }).join("");

  destActiveIndex = -1;
  destSugg.querySelectorAll('.item').forEach(el => {
    el.addEventListener('click', () => {
      const name = el.getAttribute('data-name');
      const f = FACILITIES.find(x => x.name === name);
      if (!f) return;
      destInput.value = f.name;
      selectedDest = { lat: f.lat, lng: f.lng };
      // Center map and preview destination marker
      try { map.setCenter(f.lat, f.lng); map.addMarker('dest', f.lat, f.lng, f.name); } catch {}
      destSugg.innerHTML = "";
    });
  });
}
destInput.addEventListener("input", () => {
  const q = destInput.value.trim().toLowerCase();
  selectedDest = null;
  if (!q) { 
    // Show popular or nearby by default
    renderSuggestions(FACILITIES);
    return; 
  }
  const matches = FACILITIES
    .map(f => ({ f, s: facilityScore(f, q) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map(x => x.f);
  renderSuggestions(matches, q);
});
destInput.addEventListener("focus", () => {
  if (!destInput.value.trim()) renderSuggestions(FACILITIES);
});
destInput.addEventListener("keydown", e => {
  const items = Array.from(destSugg.querySelectorAll('.item'));
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    destActiveIndex = (destActiveIndex + 1) % items.length;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    destActiveIndex = (destActiveIndex - 1 + items.length) % items.length;
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const el = items[destActiveIndex] || items[0];
    el.click();
  } else if (e.key === 'Escape') {
    destSugg.innerHTML = "";
    return;
  } else {
    return;
  }
  items.forEach((el, i) => el.classList.toggle('active', i === destActiveIndex));
});

// Booking form submit => compute nearby, estimates
document.getElementById("bookingForm").addEventListener("submit", async e => {
  e.preventDefault();
  let pickup = pickupLatLng;
  // Pickup must be set via 'Use my location' or map tap. No manual address entry anymore.
  if (!pickup) {
    alert("Please set pickup location (tap 'Use my location' or click on the map). ");
    return;
  }
  const destinationText = document.getElementById("destination").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const serviceType = serviceTypeEl.value;

  if (!pickup) return alert("Please set pickup location (use map or 'Use my location').");
  if (serviceType !== "Mortuary" && !destinationText) return alert("Please enter destination address or hospital.");
  if (!/^\d{10}$/.test(phone)) return alert("Please enter a valid 10-digit contact number.");

  // Destination: if user selected a facility, use its coordinates; else try fuzzy match; else fallback near center
  let dest = selectedDest;
  if (!dest) {
    if (serviceType === "Mortuary") {
      // Destination optional: use pickup as destination baseline
      dest = pickup;
    } else {
      const match = FACILITIES.find(f => destinationText.toLowerCase().includes(f.name.toLowerCase()));
      dest = match ? { lat: match.lat, lng: match.lng } : jitter(map.getCenter(), 0.01);
    }
  }

  // Filter fleet by service type (Any => BLS or ALS)
  const candidates = FLEET.filter(v => {
    if (serviceType === "Any") return v.type === "BLS" || v.type === "ALS";
    return v.type === serviceType;
  });

  // Compute distance from pickup, ETA and fare to destination
  nearbyAmbulances = candidates
    .map(v => {
      const distToPickup = haversine({ lat: v.lat, lng: v.lng }, pickup);
      const tripDistance = haversine(pickup, dest);
      const etaToPickup = estimateETA(distToPickup, v.speedKmph);
      const fare = estimateFare(tripDistance, v);
      return { vehicle: v, distToPickup, tripDistance, etaToPickup, fare, dest };
    })
    .sort((a, b) => a.distToPickup - b.distToPickup);

  renderNearbyList(nearbyAmbulances, pickup);
});

function parseLatLng(s) {
  const m = s.split(",");
  if (m.length !== 2) return null;
  const lat = parseFloat(m[0]);
  const lng = parseFloat(m[1]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

function jitter(center, magnitude) {
  return {
    lat: center.lat + (Math.random() - 0.5) * magnitude,
    lng: center.lng + (Math.random() - 0.5) * magnitude,
  };
}

function renderNearbyList(items, pickup) {
  const listEl = document.getElementById("nearbyList");
  listEl.innerHTML = "";
  if (!items.length) {
    listEl.innerHTML = `<p class=\"disclaimer\">No vehicles available for selected service at the moment. Please try another service type or resubmit.</p>`;
    // Ensure the Nearby card comes into view even when empty
    const listCard = listEl.closest(".card");
    if (listCard) {
      listCard.classList.add("attention");
      listCard.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => listCard.classList.remove("attention"), 1500);
    }
    return;
  }
  items.forEach((item, idx) => {
    const { vehicle, distToPickup, etaToPickup, fare, dest } = item;
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `
      <div>
        <strong>${vehicle.id}</strong> · ${vehicle.type}
        <div class=\"meta\">${distToPickup.toFixed(2)} km away · ETA to pickup ${etaToPickup} min</div>
      </div>
      <div class=\"inline\">
        <div class=\"meta\">Trip fare est. ₹ ${fare}</div>
        <button class=\"btn primary\" data-book-idx=\"${idx}\">Book</button>
      </div>
    `;
    listEl.appendChild(div);
  });
  listEl.querySelectorAll("[data-book-idx]").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-book-idx"), 10);
      startTrip(items[idx], pickup);
    });
  });

  // Bring Nearby section to user's view and briefly highlight it
  const listCard = listEl.closest(".card");
  if (listCard) {
    listCard.classList.add("attention");
    listCard.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => listCard.classList.remove("attention"), 1500);
  }

  // Accessibility: focus first Book button for quick action
  const firstBookBtn = listEl.querySelector("[data-book-idx]");
  if (firstBookBtn) {
    try { firstBookBtn.focus(); } catch {}
  }
}

// Start trip => navigate to tracking and simulate movement
function startTrip(quote, pickup) {
  selectedQuote = quote;
  location.hash = "#track";
  // Defer setup slightly so the route toggles to #track before we populate and scroll
  setTimeout(() => setupTracking(quote, pickup), 60);
}

function setupTracking(quote, pickup) {
  const infoEl = document.getElementById("trackInfo");
  const { vehicle, dest, tripDistance } = quote;
  infoEl.textContent = `Vehicle ${vehicle.id} (${vehicle.type}) en route. Trip distance ~ ${tripDistance.toFixed(1)} km.`;
  document.getElementById("liveFare").textContent = estimateFare(tripDistance, vehicle);
  document.getElementById("liveVehicle").textContent = `${vehicle.id} · ${vehicle.type}`;

  // Populate and show fake driver profile for the demo
  const driver = pickFakeDriver();
  const driverCard = document.getElementById("driverCard");
  if (driverCard) {
    const reg = generateVehicleReg(vehicle.id);
    const phone = driver.phone;
    const telHref = `tel:+91${phone}`;
    const supportHref = `tel:+18002742764`;
    const nameEl = document.getElementById("driverName");
    const phoneEl = document.getElementById("driverPhone");
    const phoneLinkEl = document.getElementById("driverPhoneLink");
    const typeEl = document.getElementById("driverAmbulanceType");
    const regEl = document.getElementById("driverVehicleNo");
    const supportLinkEl = document.getElementById("supportPhoneLink");
    if (nameEl) nameEl.textContent = driver.name;
    if (phoneEl) phoneEl.textContent = phone;
    if (phoneLinkEl) phoneLinkEl.href = telHref;
    if (typeEl) typeEl.textContent = vehicle.type;
    if (regEl) regEl.textContent = reg;
    if (supportLinkEl) supportLinkEl.href = supportHref;
    driverCard.hidden = false;
    // On mobile, ensure the driver card is visible and highlighted
    driverCard.classList.add("attention");
    driverCard.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => driverCard.classList.remove("attention"), 1500);
  }

  // Map setup for tracking
  trackMap = createMapRenderer("trackMap", pickup, 14);
  trackMap.addMarker("pickup", pickup.lat, pickup.lng, "Pickup");
  trackMap.addMarker("dest", dest.lat, dest.lng, "Destination");
  trackMap.addMarker("ambulance", vehicle.lat, vehicle.lng, "Ambulance");

  // Simulate movement from vehicle -> pickup -> destination
  const path = [ { lat: vehicle.lat, lng: vehicle.lng }, pickup, dest ];
  const speedKmph = vehicle.speedKmph;
  simulateMovement(path, speedKmph);

  document.getElementById("endTrip").onclick = () => endTrip();
}

function simulateMovement(path, speedKmph) {
  // Convert speed to meters/second
  const speedMps = (speedKmph * 1000) / 3600;
  // Build segments with distances
  const segments = [];
  for (let i = 0; i < path.length - 1; i++) {
    segments.push({ from: path[i], to: path[i+1], distKm: haversine(path[i], path[i+1]) });
  }
  let currentSeg = 0;
  let progressMeters = 0;

  if (trackTimer) clearInterval(trackTimer);
  trackTimer = setInterval(() => {
    const seg = segments[currentSeg];
    const totalMeters = seg.distKm * 1000;
    progressMeters += speedMps * 1.5; // step every 1.5s
    const t = Math.min(progressMeters / totalMeters, 1);
    const lat = seg.from.lat + (seg.to.lat - seg.from.lat) * t;
    const lng = seg.from.lng + (seg.to.lng - seg.from.lng) * t;
    trackMap.updateMarker("ambulance", lat, lng);
    trackMap.setCenter(lat, lng);

    // Update ETA remaining (remaining path distances)
    let remainingKm = (1 - t) * seg.distKm;
    for (let j = currentSeg + 1; j < segments.length; j++) remainingKm += segments[j].distKm;
    const minutes = estimateETA(remainingKm, speedKmph);
    document.getElementById("liveEta").textContent = `${minutes} min`;

    if (t >= 1) {
      currentSeg++;
      progressMeters = 0;
      if (currentSeg >= segments.length) {
        clearInterval(trackTimer);
        document.getElementById("trackInfo").textContent = "Ambulance arrived at destination. Trip complete.";
      }
    }
  }, 1500);
}

function endTrip() {
  if (trackTimer) clearInterval(trackTimer);
  alert("Trip ended. Thank you for using Arogya.");
  location.hash = "#home";
  // reset tracking map
  setTimeout(() => {
    trackMap = null;
  }, 100);
  const driverCard = document.getElementById("driverCard");
  if (driverCard) driverCard.hidden = true;
}

// AI Seek – Aggregated sources (DuckDuckGo IA, Wikipedia)
document.getElementById("aiForm").addEventListener("submit", async e => {
  e.preventDefault();
  const q = document.getElementById("aiQuery").value.trim();
  const out = document.getElementById("aiContent");
  const srcEl = document.getElementById("aiSources");
  out.innerHTML = "Searching…";
  srcEl.innerHTML = "";
  if (!q) { out.textContent = "Please enter a question."; return; }
  try {
    // Try local LLM proxy first
    try {
      const llm = await fetch("http://127.0.0.1:5050/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q })
      }).then(r => r.json());
      if (llm && llm.answer) {
        out.innerHTML = `<div class='result'><h4>AI Answer</h4><p>${llm.answer.replace(/\n/g, '<br/>')}</p></div>`;
        srcEl.innerHTML = `<span class='pill active'>AI</span>`;
        return; // done
      }
    } catch (_) {}

    // Try DuckDuckGo instant answer
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
    const ddg = await fetch(ddgUrl).then(r => r.json()).catch(() => null);
    let used = false;
    if (ddg && ddg.AbstractText) {
      const src = ddg.AbstractURL || ddg.AbstractSource || "DuckDuckGo IA";
      out.innerHTML = `<div class='result'><h4>${ddg.Heading || q}</h4><p>${ddg.AbstractText}</p><div class='meta'>Source: <a href='${ddg.AbstractURL}' target='_blank' rel='noopener'>${src}</a></div></div>`;
      srcEl.innerHTML = `<span class='pill active'>DuckDuckGo IA</span>`;
      used = true;
    }

    if (!used) {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srsearch=${encodeURIComponent(q)}`;
      const sres = await fetch(searchUrl).then(r => r.json());
      const hit = sres?.query?.search?.[0];
      if (!hit) { out.textContent = "No results found. Try rephrasing your query."; srcEl.innerHTML = `<span class='pill'>No source</span>`; return; }
      const title = hit.title;
      const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      const summary = await fetch(sumUrl).then(r => r.json());
      const html = `
        <div class=\"result\">
          <h4>${summary?.title || title}</h4>
          <p>${summary?.extract || "Summary not available."}</p>
          <div class=\"meta\">Source: <a href=\"${summary?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`}\" target=\"_blank\" rel=\"noopener\">Wikipedia</a></div>
        </div>`;
      out.innerHTML = html;
      srcEl.innerHTML = `<span class='pill active'>Wikipedia</span>`;
    }
  } catch (err) {
    out.textContent = "Error fetching information. Please try again.";
    console.error(err);
  }
});

document.getElementById("notifyBtn").addEventListener("click", () => {
  const email = document.getElementById("notifyEmail").value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return alert("Please enter a valid email.");
  alert("Thanks! We will notify you when the forum launches.");
});

// Boot
initMap();
loadFacilities();

// AI notify
const notifyAiBtn = document.getElementById("notifyAiBtn");
if (notifyAiBtn) {
  notifyAiBtn.addEventListener("click", () => {
    const email = document.getElementById("notifyAiEmail").value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return alert("Please enter a valid email.");
    alert("Thanks! You will be notified when AI Seek launches.");
  });
}