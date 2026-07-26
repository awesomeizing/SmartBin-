import { useDatabase } from '@/contexts/DatabaseContext';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet's default icon path issues in Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom markers based on luxury monochrome status
const createCustomIcon = (color: string, glow: string) => {
  return L.divIcon({
    className: 'custom-div-icon bg-transparent',
    html: `<div style="background-color:${color}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid #000; box-shadow: 0 0 12px ${glow}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
};

const iconHealthy = createCustomIcon('#a1a1aa', 'rgba(161, 161, 170, 0.4)'); // Zinc 400
const iconWarning = createCustomIcon('#ffffff', 'rgba(255, 255, 255, 0.8)'); // Bright white pulse for alert

export function MapView() {
  const { bins, loading } = useDatabase();
  const position: [number, number] = [40.7128, -74.0060]; // NY center for demo

  // Hardcode some coordinates for the mocked demo bins
  const binLocations: Record<string, [number, number]> = {
    'bin1': [40.7138, -74.0050],
    'bin2': [40.7118, -74.0080],
  };

  return (
    <div className="h-full flex flex-col space-y-6 animate-fade-in max-w-[1600px] mx-auto pb-6">
      <div className="border-b border-white/[0.05] pb-6">
        <h1 className="text-2xl font-display font-medium tracking-tight">Geospatial Intelligence</h1>
        <p className="text-zinc-500 text-sm mt-1">Real-time topographical overview of active hardware nodes.</p>
      </div>

      <div className="flex-1 bg-white/[0.01] border border-white/[0.05] rounded-2xl overflow-hidden relative shadow-2xl shadow-black/50">
        <MapContainer center={position} zoom={15} style={{ height: '100%', width: '100%', backgroundColor: '#000000' }}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          
          {/* Zone Circle */}
          <Circle center={position} pathOptions={{ color: '#ffffff', fillColor: '#ffffff', fillOpacity: 0.03, weight: 1 }} radius={600} />

          {/* Render Bins */}
          {!loading && bins && Object.values(bins).map((bin: any) => {
            const loc = binLocations[bin.id] || position;
            const isFull = bin.fillLevel >= 80;
            return (
              <Marker key={bin.id} position={loc} icon={isFull ? iconWarning : iconHealthy}>
                <Popup className="custom-popup">
                  <div className="p-3 min-w-[180px] bg-zinc-950/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl text-white">
                    <div className="font-medium text-sm mb-3 tracking-tight">{bin.location}</div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-zinc-500 text-[10px] font-mono uppercase tracking-widest">Capacity</span>
                        <span className={`font-mono text-xs ${isFull ? 'text-white font-bold' : 'text-zinc-400'}`}>{bin.fillLevel}%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-zinc-500 text-[10px] font-mono uppercase tracking-widest">Power</span>
                        <span className="font-mono text-xs text-zinc-400">{bin.battery}%</span>
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
