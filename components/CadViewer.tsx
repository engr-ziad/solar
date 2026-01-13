import React, { useMemo, useEffect, useState, useRef } from 'react';
import { SolarSystemData, ComponentType, SolarComponent, Connection } from '../types';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface CadViewerProps {
  data: SolarSystemData;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onSystemUpdate?: (newData: SolarSystemData) => void;
}

// Layout Constants
const CANVAS_WIDTH = 2000; 
const MIN_CANVAS_HEIGHT = 1000;
const BASE_NODE_HEIGHT = 100;
const LEVEL_WIDTH = 180;
const GRID_SNAP = 20;
const ICON_OFFSET = 35; // increased from 20 for larger icons

const LEVEL_MAP: Record<string, number> = {
  [ComponentType.PV_ARRAY]: 0,
  [ComponentType.DC_COMBINER]: 1,
  [ComponentType.DC_SPD]: 1.2,
  [ComponentType.DC_BREAKER]: 1.5,
  [ComponentType.INVERTER]: 2,
  [ComponentType.AC_BREAKER]: 2.5,
  [ComponentType.AC_SPD]: 2.8,
  [ComponentType.AC_DISTRIBUTION]: 3,
  [ComponentType.LOAD]: 3.5,
  [ComponentType.METER]: 4,
  [ComponentType.GRID]: 5
};

const getLevelX = (type: ComponentType) => {
  const lvl = LEVEL_MAP[type] ?? 2;
  const startX = 100;
  return startX + (lvl * LEVEL_WIDTH);
};

const getNodeHeight = (component: SolarComponent) => {
  const base = BASE_NODE_HEIGHT;
  const specsHeight = (component.specs?.length || 0) * 15;
  return base + specsHeight;
};

const calculateSmartLayout = (components: SolarComponent[], connections: Connection[]) => {
  const allHavePos = components.every(c => c.x !== undefined && c.y !== undefined);
  if (allHavePos) {
      let maxY = 0;
      components.forEach(c => { if(c.y! > maxY) maxY = c.y!; });
      return {
          layoutedComponents: [...components],
          totalHeight: Math.max(MIN_CANVAS_HEIGHT, maxY + 200)
      };
  }

  const childrenMap = new Map<string, string[]>();
  const parentMap = new Map<string, string>();
  
  components.forEach(c => childrenMap.set(c.id, []));

  connections.forEach(conn => {
    let parent = conn.to;
    let child = conn.from;
    
    const pLevel = LEVEL_MAP[components.find(c => c.id === parent)?.type || ''] || 0;
    const cLevel = LEVEL_MAP[components.find(c => c.id === child)?.type || ''] || 0;
    const isLoad = (id: string) => components.find(c => c.id === id)?.type === ComponentType.LOAD;

    if (pLevel < cLevel && !isLoad(child)) {
        [parent, child] = [child, parent];
    }

    if (childrenMap.has(parent)) {
        childrenMap.get(parent)?.push(child);
        parentMap.set(child, parent);
    }
  });

  const roots = components.filter(c => !parentMap.has(c.id));
  roots.sort((a, b) => (LEVEL_MAP[b.type] || 0) - (LEVEL_MAP[a.type] || 0));

  const subtreeHeights = new Map<string, number>();
  
  const calcHeight = (nodeId: string): number => {
    if (subtreeHeights.has(nodeId)) return subtreeHeights.get(nodeId)!;
    
    const node = components.find(c => c.id === nodeId);
    const myHeight = node ? getNodeHeight(node) : BASE_NODE_HEIGHT;

    const children = childrenMap.get(nodeId) || [];
    if (children.length === 0) {
      subtreeHeights.set(nodeId, myHeight);
      return myHeight;
    }
    
    const childrenTotalHeight = children.reduce((sum, childId) => sum + calcHeight(childId), 0);
    const val = Math.max(myHeight, childrenTotalHeight);
    subtreeHeights.set(nodeId, val);
    return val;
  };

  roots.forEach(r => calcHeight(r.id));

  const positions = new Map<string, { x: number, y: number }>();
  let currentRootY = 100;

  const assignPosition = (nodeId: string, centerY: number) => {
    const node = components.find(c => c.id === nodeId);
    if (!node) return;
    
    let x = node.x;
    let y = node.y;

    if (x === undefined) x = getLevelX(node.type);
    if (y === undefined) y = centerY;
    
    positions.set(nodeId, { x, y });
    
    const children = childrenMap.get(nodeId) || [];
    if (children.length > 0) {
        children.sort(); 
        let startY = centerY - (subtreeHeights.get(nodeId)! / 2);
        children.forEach(childId => {
            const childHeight = subtreeHeights.get(childId)!;
            const childCenter = startY + (childHeight / 2);
            assignPosition(childId, childCenter);
            startY += childHeight;
        });
    }
  };

  roots.forEach(root => {
    const h = subtreeHeights.get(root.id)!;
    const centerY = currentRootY + (h / 2);
    assignPosition(root.id, centerY);
    currentRootY += h + 40; 
  });

  const totalContentHeight = currentRootY;
  
  return {
    layoutedComponents: components.map(c => {
        const pos = positions.get(c.id) || { x: 0, y: 0 };
        const snappedX = Math.round(pos.x / GRID_SNAP) * GRID_SNAP;
        const snappedY = Math.round(pos.y / GRID_SNAP) * GRID_SNAP;
        return { ...c, x: snappedX, y: snappedY };
    }),
    totalHeight: Math.max(MIN_CANVAS_HEIGHT, totalContentHeight + 100)
  };
};

// Component Rendering Logic (Reusable)
const renderComponent = (comp: SolarComponent, isExport: boolean, getTypeColor: (t: ComponentType) => string, getComponentIcon: any) => {
    const labelYOffset = comp.type === ComponentType.INVERTER ? 40 : 35;
    return (
        <g key={comp.id}>
             {getComponentIcon(comp.type, comp.x!, comp.y!)}
             <g transform={`translate(${comp.x}, ${comp.y! - 42})`}>
                <rect x="-22" y="-9" width="44" height="14" fill={isExport ? "#000" : "#000"} rx="3" opacity="0.8" />
                <text 
                    x="0" 
                    y="1" 
                    textAnchor="middle" 
                    fill={isExport ? "#00FF00" : "#00FF00"} 
                    fontSize="9" 
                    className="cad-font font-mono tracking-wider font-bold"
                >
                    #{comp.id}
                </text>
            </g>
            <text x={comp.x} y={comp.y! + labelYOffset} textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" className="cad-font">{comp.label}</text>
            {comp.specs.map((spec, i) => (
                <text key={i} x={comp.x} y={comp.y! + labelYOffset + 13 + (i * 10)} textAnchor="middle" fill="#CCC" fontSize="9" className="cad-font">{spec}</text>
            ))}
        </g>
    );
};

const CadViewer: React.FC<CadViewerProps> = ({ data, onUndo, onRedo, canUndo, canRedo, onSystemUpdate }) => {
  const [layoutData, setLayoutData] = useState<{placed: SolarComponent[], height: number}>({ 
    placed: [], 
    height: MIN_CANVAS_HEIGHT 
  });
  
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const [hoveredComponent, setHoveredComponent] = useState<{ x: number, y: number, data: SolarComponent } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const containerRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const { layoutedComponents, totalHeight } = calculateSmartLayout(data.components, data.connections);
    setLayoutData({ placed: layoutedComponents, height: totalHeight });
  }, [data]);

  const handleZoom = (delta: number) => {
    setScale(prev => Math.min(Math.max(0.1, prev + delta), 4));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.altKey || (e.target as Element).tagName === 'svg' || (e.target as Element).id === 'cad-bg') {
        setIsPanning(true);
        setPanStart({ x: e.clientX - translate.x, y: e.clientY - translate.y });
        e.preventDefault();
    }
  };

  const handleComponentMouseDown = (e: React.MouseEvent, comp: SolarComponent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    
    setSelectedId(comp.id);
    setDraggingId(comp.id);
    
    const mouseSvgX = (e.clientX - (containerRef.current?.getBoundingClientRect().left || 0) - translate.x) / scale;
    const mouseSvgY = (e.clientY - (containerRef.current?.getBoundingClientRect().top || 0) - translate.y) / scale;
    
    setDragOffset({
        x: mouseSvgX - (comp.x || 0),
        y: mouseSvgY - (comp.y || 0)
    });
  };

  const handleGlobalMouseMove = (e: MouseEvent) => {
    if (isPanning) {
        setTranslate({
            x: e.clientX - panStart.x,
            y: e.clientY - panStart.y
        });
    } else if (draggingId) {
        const mouseSvgX = (e.clientX - (containerRef.current?.getBoundingClientRect().left || 0) - translate.x) / scale;
        const mouseSvgY = (e.clientY - (containerRef.current?.getBoundingClientRect().top || 0) - translate.y) / scale;
        
        const rawX = mouseSvgX - dragOffset.x;
        const rawY = mouseSvgY - dragOffset.y;
        
        const snappedX = Math.round(rawX / GRID_SNAP) * GRID_SNAP;
        const snappedY = Math.round(rawY / GRID_SNAP) * GRID_SNAP;

        setLayoutData(prev => ({
            ...prev,
            placed: prev.placed.map(c => c.id === draggingId ? { ...c, x: snappedX, y: snappedY } : c)
        }));
    }
  };

  const handleGlobalMouseUp = () => {
    if (isPanning) {
        setIsPanning(false);
    }
    if (draggingId) {
        if (onSystemUpdate) {
            const updatedComponents = data.components.map(c => {
                const layoutC = layoutData.placed.find(lc => lc.id === c.id);
                if (layoutC) return { ...c, x: layoutC.x, y: layoutC.y };
                return c;
            });
            onSystemUpdate({ ...data, components: updatedComponents });
        }
        setDraggingId(null);
    }
  };

  useEffect(() => {
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isPanning, draggingId, translate, scale, layoutData]);

  // --- Export Logic ---
  const handleDownloadImage = async () => {
    if (!exportRef.current) return;
    try {
      const canvas = await html2canvas(exportRef.current, { backgroundColor: '#181818', scale: 2 });
      const link = document.createElement('a');
      link.download = `${data.meta.projectName || 'design'}_SLD.png`;
      link.href = canvas.toDataURL();
      link.click();
    } catch (err) { console.error("Export failed", err); }
  };

  const handleDownloadPDF = async () => {
    if (!exportRef.current) return;
    try {
      const canvas = await html2canvas(exportRef.current, { backgroundColor: '#181818', scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width, canvas.height] });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${data.meta.projectName || 'design'}_SLD.pdf`);
    } catch (err) { console.error("PDF Export failed", err); }
  };

  // --- Helpers ---
  const handlePropertyChange = (field: 'label' | 'specs', value: string) => {
      if (!selectedId || !onSystemUpdate) return;
      const updatedComponents = data.components.map(c => {
          if (c.id === selectedId) {
              if (field === 'specs') return { ...c, specs: value.split('\n') };
              return { ...c, label: value };
          }
          return c;
      });
      onSystemUpdate({ ...data, components: updatedComponents });
  };

  const selectedComponent = layoutData.placed.find(c => c.id === selectedId);
  
  const getComponentIcon = (type: ComponentType, x: number, y: number) => {
    const color = getTypeColor(type);
    const strokeW = 1.5;
    switch (type) {
      case ComponentType.PV_ARRAY:
        return (
          <g transform={`translate(${x-25}, ${y-25})`}>
            {/* Solar Panel Look */}
            <rect x="0" y="0" width="50" height="35" rx="2" stroke={color} fill="#111" strokeWidth={strokeW} />
            <line x1="0" y1="17.5" x2="50" y2="17.5" stroke={color} strokeWidth="1" />
            <line x1="16.6" y1="0" x2="16.6" y2="35" stroke={color} strokeWidth="1" />
            <line x1="33.3" y1="0" x2="33.3" y2="35" stroke={color} strokeWidth="1" />
            {/* Shine */}
            <path d="M5,5 L15,25" stroke="white" strokeOpacity="0.1" strokeWidth="4"/>
            {/* Terminal lines */}
            <path d="M25,35 L25,50" stroke={color} strokeWidth={strokeW} />
          </g>
        );
      case ComponentType.INVERTER:
        return (
          <g transform={`translate(${x-25}, ${y-25})`}>
            <rect x="0" y="0" width="50" height="50" rx="4" stroke={color} fill="#111" strokeWidth={strokeW} />
            {/* Diagonal division */}
            <line x1="0" y1="0" x2="50" y2="50" stroke={color} strokeWidth="0.5" strokeDasharray="3,3"/>
            {/* DC Symbol Top Right */}
            <g transform="translate(28, 12)">
                <line x1="0" y1="0" x2="14" y2="0" stroke={color} strokeWidth="1.5"/>
                <line x1="0" y1="4" x2="14" y2="4" stroke={color} strokeWidth="1.5" strokeDasharray="3,2"/>
            </g>
            {/* AC Symbol Bottom Left */}
            <g transform="translate(8, 32)">
                <path d="M0,4 Q3.5,0 7,4 T14,4" stroke={color} fill="none" strokeWidth="1.5"/>
            </g>
          </g>
        );
      case ComponentType.GRID:
        return (
          <g transform={`translate(${x-20}, ${y-30})`}>
             <path d="M20,0 L20,40 M5,15 L35,15 M10,25 L30,25" stroke={color} strokeWidth={strokeW} fill="none"/>
             <circle cx="20" cy="0" r="3" fill={color}/>
             <path d="M15,40 L25,40" stroke={color} strokeWidth="2"/>
             <text x="20" y="52" textAnchor="middle" fill={color} fontSize="8" className="cad-font font-bold">GRID</text>
          </g>
        );
      case ComponentType.AC_DISTRIBUTION:
      case ComponentType.DC_COMBINER:
        return (
          <g transform={`translate(${x-20}, ${y-25})`}>
            <rect x="0" y="0" width="40" height="50" rx="2" stroke={color} fill="#1a1a1a" strokeWidth={strokeW} />
            {/* Busbars */}
            <line x1="8" y1="5" x2="8" y2="45" stroke={color} strokeWidth="1.5"/>
            <line x1="32" y1="5" x2="32" y2="45" stroke={color} strokeWidth="1.5"/>
            {/* Switches */}
            <rect x="12" y="12" width="16" height="4" fill={color} opacity="0.6"/>
            <rect x="12" y="23" width="16" height="4" fill={color} opacity="0.6"/>
            <rect x="12" y="34" width="16" height="4" fill={color} opacity="0.6"/>
          </g>
        );
      case ComponentType.DC_BREAKER:
      case ComponentType.AC_BREAKER:
        return (
          <g transform={`translate(${x-15}, ${y-15})`}>
            <rect x="0" y="0" width="30" height="30" rx="4" stroke={color} fill="#222" strokeWidth={strokeW} />
            {/* Switch symbol */}
            <path d="M15,25 L15,18 L22,8" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round"/>
            <circle cx="15" cy="25" r="2" fill={color}/>
            <circle cx="22" cy="8" r="2" fill="none" stroke={color} strokeWidth="1"/>
            <text x="5" y="10" fill={color} fontSize="6" className="cad-font">CB</text>
          </g>
        );
      case ComponentType.DC_SPD:
      case ComponentType.AC_SPD:
        return (
          <g transform={`translate(${x-15}, ${y-15})`}>
             <rect x="0" y="0" width="30" height="30" rx="4" stroke={color} fill="#222" strokeWidth={strokeW} />
             {/* Arrow to ground symbol */}
             <path d="M15,5 L15,18" stroke={color} strokeWidth="2" />
             <path d="M15,18 L10,13 M15,18 L20,13" stroke={color} strokeWidth="2" fill="none"/>
             <line x1="12" y1="23" x2="18" y2="23" stroke={color} strokeWidth="1.5"/>
             <line x1="14" y1="26" x2="16" y2="26" stroke={color} strokeWidth="1.5"/>
             <text x="25" y="25" textAnchor="middle" fill={color} fontSize="6" className="cad-font font-bold">SPD</text>
          </g>
        );
      case ComponentType.METER:
         return (
          <g transform={`translate(${x-15}, ${y-15})`}>
             <circle cx="15" cy="15" r="15" stroke={color} fill="#1a1a1a" strokeWidth={strokeW} />
             <rect x="8" y="12" width="14" height="8" fill="#000" stroke={color} strokeWidth="0.5"/>
             <text x="15" y="18" textAnchor="middle" fill={color} fontSize="6" className="cad-font font-mono">123</text>
             <text x="15" y="8" textAnchor="middle" fill={color} fontSize="5" className="cad-font">kWh</text>
          </g>
         );
      case ComponentType.LOAD:
         return (
          <g transform={`translate(${x-20}, ${y-20})`}>
             <path d="M5,20 L20,5 L35,20 L35,35 L5,35 Z" stroke={color} fill="#111" strokeWidth={strokeW} />
             <rect x="17" y="25" width="6" height="10" fill="#000" stroke={color} strokeWidth="1"/>
             <path d="M20,5 L20,0 M20,0 L15,0" stroke={color} strokeWidth="1"/>
          </g>
         );
      default:
        return <rect x={x-10} y={y-10} width="20" height="20" stroke={color} fill="none" />;
    }
  };

  const getTypeColor = (type: ComponentType) => {
    switch (type) {
      case ComponentType.PV_ARRAY: return '#00FFFF';
      case ComponentType.INVERTER: return '#FF00FF';
      case ComponentType.GRID: return '#FFFF00';
      case ComponentType.DC_COMBINER: return '#00FF00';
      case ComponentType.DC_BREAKER: return '#FF4500'; // OrangeRed
      case ComponentType.AC_BREAKER: return '#FF4500'; // OrangeRed
      case ComponentType.DC_SPD: return '#FFD700';     // Gold
      case ComponentType.AC_SPD: return '#FFD700';     // Gold
      case ComponentType.LOAD: return '#FFA500';
      default: return '#FFFFFF';
    }
  };

  // --- Export Bounds Calculation ---
  const exportBounds = useMemo(() => {
    if (layoutData.placed.length === 0) return { x: 0, y: 0, w: 800, h: 600 };
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    layoutData.placed.forEach(c => {
        if ((c.x ?? 0) < minX) minX = c.x ?? 0;
        if ((c.x ?? 0) > maxX) maxX = c.x ?? 0;
        if ((c.y ?? 0) < minY) minY = c.y ?? 0;
        if ((c.y ?? 0) > maxY) maxY = c.y ?? 0;
    });
    
    const padding = 150;
    return {
        x: minX - padding,
        y: minY - padding,
        w: (maxX - minX) + (padding * 2),
        h: (maxY - minY) + (padding * 2)
    };
  }, [layoutData]);

  return (
    <div className="w-full h-full bg-[#181818] relative overflow-hidden border-2 border-[#333] shadow-inner flex flex-col">
      {/* UI OVERLAYS - Same as before */}
      <div className="absolute top-4 left-4 z-20 flex gap-2">
          <div className="relative">
              <input 
                 type="text" 
                 placeholder="Search ID, Type..." 
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="bg-black/50 backdrop-blur border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white w-48 focus:border-yellow-500 outline-none"
              />
              <svg className="w-3 h-3 text-gray-400 absolute right-3 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
      </div>

      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 items-end">
        <div className="flex bg-black/50 backdrop-blur rounded-lg border border-gray-700 p-1">
            <button onClick={onUndo} disabled={!canUndo} className="p-2 text-white hover:text-yellow-400 hover:bg-white/10 rounded disabled:opacity-30 disabled:cursor-not-allowed" title="Undo (Ctrl+Z)">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg>
            </button>
            <div className="w-px bg-gray-600 mx-1"></div>
            <button onClick={onRedo} disabled={!canRedo} className="p-2 text-white hover:text-yellow-400 hover:bg-white/10 rounded disabled:opacity-30 disabled:cursor-not-allowed" title="Redo (Ctrl+Y)">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="scale-x-[-1]"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg>
            </button>
        </div>

        <div className="flex bg-black/50 backdrop-blur rounded-lg border border-gray-700 p-1">
            <button onClick={() => handleZoom(0.1)} className="p-2 text-white hover:text-yellow-400 hover:bg-white/10 rounded" title="Zoom In">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <button onClick={() => handleZoom(-0.1)} className="p-2 text-white hover:text-yellow-400 hover:bg-white/10 rounded" title="Zoom Out">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <button onClick={() => {setScale(1); setTranslate({x:0, y:0})}} className="p-2 text-white hover:text-yellow-400 hover:bg-white/10 rounded text-xs font-mono">
               100%
            </button>
        </div>

        <div className="flex bg-black/50 backdrop-blur rounded-lg border border-gray-700 p-1">
            <button onClick={handleDownloadImage} className="p-2 text-cyan-400 hover:bg-white/10 rounded flex items-center gap-1 text-xs" title="Download Image">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
               IMG
            </button>
            <div className="w-px bg-gray-600 mx-1"></div>
            <button onClick={handleDownloadPDF} className="p-2 text-red-400 hover:bg-white/10 rounded flex items-center gap-1 text-xs" title="Download PDF">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
               PDF
            </button>
        </div>
      </div>

      {selectedComponent && (
          <div className="absolute top-20 right-4 z-20 w-64 bg-black/80 backdrop-blur border border-gray-700 rounded-lg shadow-2xl p-4 flex flex-col gap-3">
              <div className="flex justify-between items-center border-b border-gray-600 pb-2">
                  <span className="text-yellow-500 font-bold text-sm">Properties</span>
                  <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-white">✕</button>
              </div>
              <div>
                  <label className="text-xs text-gray-400 block mb-1">ID</label>
                  <input type="text" value={selectedComponent.id} disabled className="w-full bg-[#333] border border-gray-600 rounded px-2 py-1 text-xs text-gray-500" />
              </div>
              <div>
                  <label className="text-xs text-gray-400 block mb-1">Label</label>
                  <input type="text" value={selectedComponent.label} onChange={(e) => handlePropertyChange('label', e.target.value)} className="w-full bg-[#1e1e1e] border border-gray-600 rounded px-2 py-1 text-xs text-white focus:border-yellow-500 outline-none" />
              </div>
              <div>
                  <label className="text-xs text-gray-400 block mb-1">Specs (one per line)</label>
                  <textarea value={selectedComponent.specs.join('\n')} onChange={(e) => handlePropertyChange('specs', e.target.value)} rows={5} className="w-full bg-[#1e1e1e] border border-gray-600 rounded px-2 py-1 text-xs text-white focus:border-yellow-500 outline-none resize-none font-mono" />
              </div>
          </div>
      )}

      {/* --- HIDDEN EXPORT VIEW --- */}
      <div 
        ref={exportRef} 
        className="fixed top-0 left-0 -z-50 bg-[#181818] border-8 border-white"
        style={{ 
            width: exportBounds.w, 
            height: exportBounds.h + 100, // Extra height for metadata header 
            transform: 'translateX(-10000px)' 
        }}
      >
          {/* Metadata Header for Export */}
          <div className="w-full h-[100px] bg-black border-b-2 border-white p-4 flex justify-between items-center text-yellow-500 font-mono">
              <div>
                  <h1 className="text-2xl font-bold text-white mb-1">{data.meta.projectName || "Solar Design"}</h1>
                  <div className="text-sm text-gray-400">{new Date().toLocaleDateString()}</div>
              </div>
              <div className="text-right grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <span className="text-gray-500">CAPACITY:</span> <span className="text-white font-bold">{data.meta.totalCapacity}</span>
                  <span className="text-gray-500">VOLTAGE:</span> <span className="text-white font-bold">{data.meta.systemVoltage}</span>
                  <span className="text-gray-500">LOCATION:</span> <span className="text-white font-bold">{data.meta.location}</span>
              </div>
          </div>

          {/* Export SVG */}
          <svg 
            width={exportBounds.w} 
            height={exportBounds.h} 
            viewBox={`${exportBounds.x} ${exportBounds.y} ${exportBounds.w} ${exportBounds.h}`}
            className="bg-[#181818]"
          >
              <defs>
                <marker id="arrowhead-export" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                    <polygon points="0 0, 8 3, 0 6" fill="#FFF" />
                </marker>
                <marker id="dot-export" markerWidth="6" markerHeight="6" refX="3" refY="3">
                    <circle cx="3" cy="3" r="2" fill="#FFF" />
                </marker>
            </defs>
            {/* Grid for export */}
            <defs>
                 <pattern id="grid-export" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#333" strokeWidth="1"/>
                 </pattern>
            </defs>
            <rect x={exportBounds.x} y={exportBounds.y} width={exportBounds.w} height={exportBounds.h} fill="url(#grid-export)" />

            {data.connections.map((conn, idx) => {
                const fromNode = layoutData.placed.find(c => c.id === conn.from);
                const toNode = layoutData.placed.find(c => c.id === conn.to);
                if (!fromNode || !toNode) return null;

                const x1 = fromNode.x! + ICON_OFFSET; const y1 = fromNode.y!;
                const x2 = toNode.x! - ICON_OFFSET; const y2 = toNode.y!;
                const dist = Math.abs(x2 - x1);
                const cpOffset = Math.max(dist * 0.5, 60);
                const cp1x = x1 + cpOffset; const cp1y = y1;
                const cp2x = x2 - cpOffset; const cp2y = y2;
                
                // Calculate label pos
                const t = 0.5;
                const midX = (1-t)**3*x1 + 3*(1-t)**2*t*cp1x + 3*(1-t)*t**2*cp2x + t**3*x2;
                const midY = (1-t)**3*y1 + 3*(1-t)**2*t*cp1y + 3*(1-t)*t**2*cp2y + t**3*y2;

                return (
                    <g key={`conn-export-${idx}`}>
                        <path 
                            d={`M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`}
                            fill="none"
                            stroke={conn.type === 'DC' ? '#00FFFF' : (conn.type === 'AC' ? '#FF00FF' : '#00FF00')}
                            strokeWidth="2"
                            markerEnd="url(#arrowhead-export)"
                            markerStart="url(#dot-export)"
                        />
                        <rect x={midX - 20} y={midY - 8} width={conn.label.length * 6 + 10} height="16" fill="#000" rx="4" />
                        <text x={midX} y={midY + 3} fill="#FFFF00" fontSize="9" textAnchor="middle" className="cad-font">{conn.label}</text>
                    </g>
                );
            })}
            {layoutData.placed.map((comp) => renderComponent(comp, true, getTypeColor, getComponentIcon))}
          </svg>
      </div>

      {/* --- INTERACTIVE CANVAS --- */}
      <div 
        className={`w-full h-full overflow-hidden flex items-center justify-center bg-[#181818] ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`} 
        ref={containerRef}
        onMouseDown={handleMouseDown}
      >
        <div id="cad-bg"
            className="absolute inset-0 opacity-20 pointer-events-none" 
            style={{
            backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)',
            backgroundSize: `${GRID_SNAP}px ${GRID_SNAP}px`,
            backgroundPosition: `${translate.x}px ${translate.y}px`
            }}
        />
        
        {/* Tooltip & Metadata (On-screen version) */}
        {hoveredComponent && (
            <div 
                className="absolute z-50 bg-black/90 border border-yellow-500 rounded p-3 text-left pointer-events-none shadow-xl backdrop-blur-sm min-w-[200px]"
                style={{ 
                    left: (hoveredComponent.x * scale) + translate.x, 
                    top: (hoveredComponent.y * scale) + translate.y,
                    transform: 'translate(-50%, -120%)'
                }}
            >
                <div className="text-yellow-400 font-bold mb-1 border-b border-gray-700 pb-1 text-xs">
                    {hoveredComponent.data.label}
                </div>
                <div className="text-gray-300 text-[10px] space-y-1 font-mono">
                    <div className="text-green-400">ID: {hoveredComponent.data.id}</div>
                    <div className="text-blue-400">Type: {hoveredComponent.data.type}</div>
                    <div className="border-t border-gray-700 pt-1 mt-1">
                        <div className="text-gray-500 font-bold">Specs:</div>
                        {hoveredComponent.data.specs.map((s, i) => (
                            <div key={i} className="pl-1">• {s}</div>
                        ))}
                    </div>
                </div>
            </div>
        )}
        
        <div className="absolute bottom-4 right-4 bg-black border border-white p-2 w-64 text-[10px] text-yellow-500 font-mono z-10 opacity-90 pointer-events-none">
            <div className="grid grid-cols-2 gap-x-2 border-b border-gray-700 pb-1 mb-1">
            <span className="text-gray-400">PROJECT:</span>
            <span className="text-white truncate">{data.meta.projectName}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-2">
            <span className="text-gray-400">CAPACITY:</span>
            <span className="text-white truncate">{data.meta.totalCapacity}</span>
            <span className="text-gray-400">VOLTAGE:</span>
            <span className="text-white truncate">{data.meta.systemVoltage}</span>
            </div>
        </div>

        <svg 
            width={CANVAS_WIDTH} 
            height={layoutData.height} 
            viewBox={`0 0 ${CANVAS_WIDTH} ${layoutData.height}`}
            style={{
                transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                transformOrigin: '0 0',
                transition: isPanning || draggingId ? 'none' : 'transform 0.1s ease-out'
            }}
        >
            <defs>
                <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                    <polygon points="0 0, 8 3, 0 6" fill="#666" />
                </marker>
                <marker id="dot" markerWidth="6" markerHeight="6" refX="3" refY="3">
                    <circle cx="3" cy="3" r="2" fill="#FFF" />
                </marker>
                <filter id="highlight-glow">
                    <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                    <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
            </defs>

            {data.connections.map((conn, idx) => {
                // Interactive Connections Logic
                const fromNode = layoutData.placed.find(c => c.id === conn.from);
                const toNode = layoutData.placed.find(c => c.id === conn.to);
                if (!fromNode || !toNode) return null;

                const x1 = fromNode.x! + ICON_OFFSET; const y1 = fromNode.y!;
                const x2 = toNode.x! - ICON_OFFSET; const y2 = toNode.y!;
                const dist = Math.abs(x2 - x1);
                const cpOffset = Math.max(dist * 0.5, 60);
                const cp1x = x1 + cpOffset; const cp1y = y1;
                const cp2x = x2 - cpOffset; const cp2y = y2;
                
                const t = 0.5;
                const midX = (1-t)**3*x1 + 3*(1-t)**2*t*cp1x + 3*(1-t)*t**2*cp2x + t**3*x2;
                const midY = (1-t)**3*y1 + 3*(1-t)**2*t*cp1y + 3*(1-t)*t**2*cp2y + t**3*y2;

                return (
                    <g key={`conn-${idx}`}>
                        <path 
                            d={`M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`}
                            fill="none"
                            stroke={conn.type === 'DC' ? '#00FFFF' : (conn.type === 'AC' ? '#FF00FF' : '#00FF00')}
                            strokeWidth="1.5"
                            strokeOpacity="0.8"
                            markerEnd="url(#arrowhead)"
                            markerStart="url(#dot)"
                        />
                        <rect x={midX - 20} y={midY - 8} width={conn.label.length * 6 + 10} height="16" fill="#000" stroke="#333" strokeWidth="0.5" rx="4" />
                        <text x={midX} y={midY + 3} fill="#FFFF00" fontSize="9" textAnchor="middle" className="cad-font">{conn.label}</text>
                    </g>
                );
            })}

            {layoutData.placed.map((comp) => {
                const isMatch = searchQuery && (
                    comp.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                    comp.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
                    comp.type.toLowerCase().includes(searchQuery.toLowerCase())
                );
                
                return (
                    <g 
                        key={comp.id} 
                        onMouseDown={(e) => handleComponentMouseDown(e, comp)}
                        onMouseEnter={() => setHoveredComponent({ x: comp.x!, y: comp.y!, data: comp })}
                        onMouseLeave={() => setHoveredComponent(null)}
                        className="cursor-pointer transition-opacity"
                        style={{ opacity: searchQuery && !isMatch ? 0.3 : 1 }}
                        filter={isMatch || selectedId === comp.id ? "url(#highlight-glow)" : ""}
                    >
                        <rect x={comp.x! - 30} y={comp.y! - 30} width="60" height="100" fill="transparent" />
                        {renderComponent(comp, false, getTypeColor, getComponentIcon)}
                    </g>
                );
            })}
        </svg>
      </div>
    </div>
  );
};

export default CadViewer;