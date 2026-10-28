// Desk ids come from the same Tiled map the game loads, so hiring can only use real desks.
import officeMap from '../../web/public/maps/office.json' with { type: 'json' };

interface MapJson { layers: Array<{ type: string; objects?: Array<{ type: string; name: string }> }> }

export const DESK_IDS: readonly string[] = (officeMap as MapJson).layers
  .flatMap(l => (l.type === 'objectgroup' ? l.objects ?? [] : []))
  .filter(o => o.type === 'desk')
  .map(o => o.name);
