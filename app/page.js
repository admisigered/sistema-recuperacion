'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './lib/supabase';
import * as XLSX from 'xlsx';
import { 
  LayoutDashboard, FileText, Upload, Download, Search, 
  LogOut, ChevronLeft, ChevronRight, Save, Plus, Clock, 
  CheckCircle2, AlertCircle, Trash2, Filter, X, CheckSquare, Square, 
  Calendar, Phone, BookOpen, MessageSquare, BarChart3, Truck, Briefcase, UserCheck
} from 'lucide-react';

// --- CONFIGURACIÓN DE USUARIOS AUTORIZADOS ---
const USUARIOS = [
  { user: 'ADMINISTRADOR', pass: 'admin123' },
  { user: 'YANINA', pass: '123456' },
  { user: 'CESAR', pass: '123456' },
  { user: 'XINA', pass: '123456' },
  { user: 'FERNANDO', pass: '123456' }
];

const LISTA_RESPONSABLES = ["ADMINISTRADOR", "YANINA", "CESAR", "XINA", "FERNANDO"];

export default function SistemaSIGERED() {
  // --- ESTADOS DEL SISTEMA ---
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [page, setPage] = useState(1);
  const [view, setView] = useState('dashboard');
  const [editingDoc, setEditingDoc] = useState(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [loginData, setLoginData] = useState({ user: '', pass: '' });
  const [activeTab, setActiveTab] = useState(1);
  const [seguimientos, setSeguimientos] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  
  // --- FILTROS GLOBALES (CONECTADOS) ---
  const [filters, setFilters] = useState({ 
    search: '', 
    sede: '', 
    origen: '', 
    estado: '', 
    etapa: '', 
    responsable: '', 
    fechaInicio: '', 
    fechaFin: '' 
  });

  const ITEMS_PER_PAGE = 100;

  // --- 1. LÓGICA DE NEGOCIO ANALÍTICA (K, L, P, AB) ---
  const getEtapaEstado = useCallback((doc) => {
    if (!doc) return { etapa: '-', estado: '-', color: 'bg-slate-100', border: 'border-slate-300' };
    
    const origen = String(doc.origen || '').toUpperCase();
    const colK = String(doc.estado_verificacion_k || 'PENDIENTE').toUpperCase();
    const colL = String(doc.estado_visualizacion || '').toUpperCase();
    const colP = doc.numero_documento;
    const colAB = doc.cargado_sisged;

    // 1. REGLA DE CIERRE: Si está en SISGED o se visualiza, es RECUPERADO
    if (colAB === true || colAB === 'true' || colL === 'SI SE VISUALIZA') {
        return { etapa: 'CIERRE', estado: 'RECUPERADO', color: 'bg-green-100 text-green-700', border: 'border-green-500' };
    }

    // 2. REGLA DE SEGUIMIENTO EN PROCESO: Si tiene algún seguimiento registrado, pasa a EN PROCESO
    if (doc.ultimo_seguimiento) {
        return { etapa: 'SEGUIMIENTO', estado: 'EN PROCESO', color: 'bg-orange-100 text-orange-700', border: 'border-orange-500' };
    }

    // 3. REGLA DE VERIFICACION: Si la Columna K sigue pendiente
    if (colK === 'PENDIENTE') {
        return { etapa: 'VERIFICACION', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
    }

    // REGLA 4: VERIFICADO Y NO SE VISUALIZA
    if (colK === 'VERIFICADO' && colL === 'NO SE VISUALIZA') {
        if (origen === 'INTERNO') {
            // Internos pasan directo a CIERRE si están verificados
            return { etapa: 'CIERRE', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
        } else {
            // EXTERNOS: La diferencia la hace el Número de Documento (Col P)
            if (!doc.numero_documento || doc.numero_documento === '' || doc.numero_documento === 'null') {
                return { etapa: 'REQUERIMIENTO', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
            }
            // Si ya tiene número de documento, es SEGUIMIENTO
            return { etapa: 'SEGUIMIENTO', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
        }
    }

  // --- 2. FUNCIONES DE APOYO ---
  const formatExcelDate = (val) => {
    if (!val) return null;
    if (typeof val === 'number') return new Date((val - 25569) * 86400 * 1000).toISOString().split('T')[0];
    if (typeof val === 'string' && val.includes('/')) {
        const parts = val.split('/');
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return val;
  };

  const calcularDiasHabiles = (fechaRef) => {
    if (!fechaRef) return 0;
    let start = new Date(fechaRef);
    let end = new Date();
    let count = 0;
    while (start <= end) {
      if (start.getDay() !== 0 && start.getDay() !== 6) count++;
      start.setDate(start.getDate() + 1);
    }
    return count;
  };

  // --- 3. GESTIÓN DE DATOS (SUPABASE) ---
  const fetchDocs = useCallback(async () => {
    setLoading(true);
    let from = (page - 1) * ITEMS_PER_PAGE;
    let to = from + ITEMS_PER_PAGE - 1;
    let query = supabase.from('documentos').select('*', { count: 'exact' });

    // --- FILTROS DE BÚSQUEDA ---
    // --- FILTROS DE BÚSQUEDA ---
    if (filters.search) {
      query = query.or(`cut.ilike.%${filters.search}%,documento.ilike.%${filters.search}%,remitente.ilike.%${filters.search}%`);
    }
    if (filters.sede) query = query.eq('sede', filters.sede);
    if (filters.origen) query = query.eq('origen', filters.origen);

    // --- FILTRO DE RESPONSABLE ---
    if (filters.responsable) {
      query = query.or(`responsable_verificacion.eq.${filters.responsable},responsable_requerimiento.eq.${filters.responsable},responsable_devolucion.eq.${filters.responsable}`);
    }

    // --- FILTRO DE ESTADO ---
    if (filters.estado) {
      if (filters.estado === 'RECUPERADO') {
        query = query.or('cargado_sisged.eq.true,estado_visualizacion.eq.SI SE VISUALIZA');
      } else if (filters.estado === 'EN PROCESO') {
        query = query.not('ultimo_seguimiento', 'is', null).eq('cargado_sisged', false).neq('estado_visualizacion', 'SI SE VISUALIZA');
      } else if (filters.estado === 'PENDIENTE') {
        query = query.is('ultimo_seguimiento', null).eq('cargado_sisged', false).neq('estado_visualizacion', 'SI SE VISUALIZA');
      }
    }

    // --- FILTRO DE ETAPA (Sincronizado con etiquetas visuales) ---
    if (filters.etapa) {
      if (filters.etapa === 'VERIFICACION') {
        query = query.eq('estado_verificacion_k', 'PENDIENTE').eq('cargado_sisged', false);
      }
      else if (filters.etapa === 'REQUERIMIENTO') {
        // Solo externos verificados sin numero de documento
        query = query.eq('origen', 'Externo').eq('estado_verificacion_k', 'VERIFICADO').eq('estado_visualizacion', 'NO SE VISUALIZA').is('numero_documento', null).eq('cargado_sisged', false);
      }
      else if (filters.etapa === 'SEGUIMIENTO') {
        // Solo externos verificados con numero de documento
        query = query.eq('origen', 'Externo').eq('estado_verificacion_k', 'VERIFICADO').eq('estado_visualizacion', 'NO SE VISUALIZA').not('numero_documento', 'is', null).eq('cargado_sisged', false);
      }
      else if (filters.etapa === 'CIERRE') {
        // Recuperados (SISGED o SI Visualiza)
        query = query.or('cargado_sisged.eq.true,estado_visualizacion.eq.SI SE VISUALIZA');
      }
    }

    const { data, count, error } = await query.order('creado_at', { ascending: false }).range(from, to);
    if (!error) { setDocs(data || []); setTotalDocs(count || 0); }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { if (session) fetchDocs(); }, [session, fetchDocs]);

  // --- 4. IMPORTACIÓN A-AD (LOGICA COL L Y RESPONSABLE CORREGIDA) ---
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        
        const validarRes = (n) => {
            const name = String(n || '').toUpperCase().trim();
            return LISTA_RESPONSABLES.includes(name) ? name : "ADMINISTRADOR";
        };

        const batch = data.slice(1).map(row => {
          if (!row[1]) return null;
          
          // Lógica de autoselección basada en Columna L (Indice 11)
          let visualizacionAuto = String(row[11] || '').toUpperCase().trim();
          if (visualizacionAuto.includes("SI") || visualizacionAuto === "VERIFICADO") visualizacionAuto = "SI SE VISUALIZA";
          else if (visualizacionAuto.includes("NO")) visualizacionAuto = "NO SE VISUALIZA";
          else visualizacionAuto = "";

          return {
            sede: row[0], cut: String(row[1]), documento: String(row[2]), remitente: row[3], fecha_registro: formatExcelDate(row[4]),
            origen: row[5], procedimiento: row[6], celular: String(row[7] || ''), 
            responsable_verificacion: validarRes(row[8]),
            fecha_verificacion: formatExcelDate(row[9]), 
            estado_verificacion_k: row[10] || 'PENDIENTE', 
            estado_visualizacion: visualizacionAuto, // Autoselección Col L
            observaciones: row[12],
            responsable_requerimiento: validarRes(row[13]), fecha_elaboracion: formatExcelDate(row[14]), numero_documento: String(row[15] || ''),
            fecha_notificacion: formatExcelDate(row[16]), medio_notificacion: row[17],
            fecha_remision: formatExcelDate(row[22]), responsable_devolucion: validarRes(row[23]), fecha_devolucion: formatExcelDate(row[24]), 
            documento_cierre: String(row[25] || ''), oficina_destino: row[26], 
            cargado_sisged: String(row[27]).toUpperCase() === 'SI', estado_final: row[28] || 'PENDIENTE',
            observaciones_finales: row[29], creado_at: new Date().toISOString()
          };
        }).filter(Boolean);
        const { error } = await supabase.from('documentos').upsert(batch, { onConflict: 'cut,documento' });
        if (error) throw error;
        alert("Sincronización Masiva Exitosa"); fetchDocs();
      } catch (err) { alert("Error al importar: " + err.message); }
    };
    reader.readAsBinaryString(file);
    e.target.value = null;
  };

  // --- 5. SINCRONIZACIÓN Y ELIMINACIÓN ---
 const handleSyncChanges = async () => {
    if (!editingDoc) return;
    try {
        setLoading(true);
        // Filtramos para enviar solo los campos que existen en la base de datos
        const { id, creado_at, ultimo_seguimiento, ...updateData } = editingDoc;
        const { error } = await supabase.from('documentos').update(updateData).eq('id', id);
        if (error) throw error;
        alert('Sincronización Exitosa'); 
        setEditingDoc(null); 
        await fetchDocs(); // Refresca la tabla automáticamente
    } catch (err) { alert('Error: ' + err.message); }
    finally { setLoading(false); }
  };

  const handleBulkDelete = async () => {
    if (session.user !== 'ADMINISTRADOR') return alert("Solo administrador.");
    if (confirm(`¿Eliminar ${selectedIds.length} registros?`)) {
      await supabase.from('documentos').delete().in('id', selectedIds);
      setSelectedIds([]); fetchDocs();
    }
  };

  const handleDeleteIndividual = async (id) => {
    if (session.user !== 'ADMINISTRADOR') return alert("Solo administrador.");
    if (confirm("¿Eliminar registro?")) {
      await supabase.from('documentos').delete().eq('id', id);
      fetchDocs();
    }
  };

  const toggleSelectDoc = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(docs);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SIGERED");
    XLSX.writeFile(wb, "Reporte_Sistemas.xlsx");
  };

  // --- 6. DASHBOARD BARRAS ---
  const chartData = useMemo(() => {
    const counts = {
      'VERIFICACION': docs.filter(d => getEtapaEstado(d).etapa === 'VERIFICACION').length,
      'REQUERIMIENTO': docs.filter(d => getEtapaEstado(d).etapa === 'REQUERIMIENTO').length,
      'SEGUIMIENTO': docs.filter(d => getEtapaEstado(d).etapa === 'SEGUIMIENTO').length,
      'CIERRE': docs.filter(d => getEtapaEstado(d).etapa === 'CIERRE').length,
    };
    const max = Math.max(...Object.values(counts), 1);
    return { counts, max };
  }, [docs, getEtapaEstado]);

  const handleLogin = (e) => {
    e.preventDefault();
    const valid = USUARIOS.find(u => u.user.toUpperCase() === loginData.user.toUpperCase() && u.pass === loginData.pass);
    if (valid) setSession(valid); else alert('Credenciales incorrectas');
  };

  useEffect(() => {
    if (editingDoc?.id) {
      supabase.from('seguimientos').select('*').eq('documento_id', editingDoc.id).order('fecha', { ascending: false })
        .then(({ data }) => setSeguimientos(data || []));
    }
  }, [editingDoc]);

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 font-sans">
        <div className="bg-white rounded-4xl shadow-2xl w-full max-w-md overflow-hidden border border-white">
          <div className="bg-brand-blue p-12 text-center text-white font-sans">
             <h1 className="text-4xl font-black mb-2 tracking-tighter uppercase">SIGERED</h1>
             <p className="text-xs font-bold uppercase tracking-widest opacity-80">Gestión de Recuperación</p>
          </div>
          <form onSubmit={handleLogin} className="p-10 space-y-6"><input type="text" placeholder="Usuario" className="w-full p-5 bg-slate-50 border rounded-3xl outline-none font-bold" onChange={e => setLoginData({...loginData, user: e.target.value})} required /><input type="password" placeholder="Contraseña" className="w-full p-5 bg-slate-50 border rounded-3xl outline-none font-bold" onChange={e => setLoginData({...loginData, pass: e.target.value})} required /><button type="submit" className="w-full bg-brand-blue text-white py-5 rounded-3xl font-black shadow-xl">INICIAR SESIÓN</button></form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex text-slate-900 font-sans">
      <aside className="w-64 bg-[#1E293B] text-slate-400 flex flex-col fixed h-full z-20 shadow-2xl">
        <div className="p-8 font-black text-white text-2xl tracking-tighter uppercase">SIGERED</div>
        <nav className="flex-1 p-4 space-y-2 mt-4">
          <button onClick={() => setView('dashboard')} className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all ${view === 'dashboard' ? 'bg-brand-blue text-white shadow-lg shadow-blue-900/40' : 'hover:bg-slate-800'}`}><LayoutDashboard size={18}/> Dashboard</button>
          <button onClick={() => setView('list')} className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all ${view === 'list' ? 'bg-brand-blue text-white shadow-lg shadow-blue-900/40' : 'hover:bg-slate-800'}`}><FileText size={18}/> Gestión</button>
        </nav>
        <div className="p-6 border-t border-slate-800 flex items-center gap-3 bg-slate-900/50">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-white uppercase shadow-inner">{session.user[0]}</div>
          <div className="flex-1 overflow-hidden font-sans"><p className="text-xs font-bold text-white truncate uppercase">{session.user}</p><p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">En Línea</p></div>
          <button onClick={() => setSession(null)}><LogOut size={18}/></button>
        </div>
      </aside>

      <main className="ml-64 flex-1 flex flex-col h-screen overflow-hidden font-sans">
        {/* HEADER FILTROS INTEGRALES */}
        <header className="bg-white border-b p-4 flex flex-wrap items-center gap-3 sticky top-0 z-10 px-8 shadow-sm h-auto min-h-[80px]">
          <div className="flex gap-2 mr-auto">
            <button onClick={() => setIsNewModalOpen(true)} className="bg-brand-blue text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-blue-700 shadow-sm transition-all"><Plus size={14}/> Nuevo</button>
            <label className="bg-white border border-slate-200 px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer hover:bg-slate-50 shadow-sm"><Upload size={14}/> Importar <input type="file" className="hidden" onChange={handleImport}/></label>
            <button onClick={handleExport} className="bg-white border border-slate-200 px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-slate-50 shadow-sm"><Download size={14}/> Reporte</button>
            {selectedIds.length > 0 && <button onClick={handleBulkDelete} className="bg-red-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg"><Trash2 size={14}/> Eliminar ({selectedIds.length})</button>}
          </div>
          
          <div className="flex flex-wrap items-center gap-2 ml-auto font-bold uppercase">
            <div className="relative"><Search size={14} className="absolute left-3 top-3 text-slate-400"/><input type="text" placeholder="Buscar CUT..." className="bg-slate-50 border-none rounded-xl pl-9 pr-4 py-2.5 text-xs w-32 outline-none focus:ring-2 focus:ring-blue-500 shadow-inner" onChange={e => setFilters({...filters, search: e.target.value})}/></div>
            <select className="border rounded-xl p-2.5 text-[10px] font-black bg-white cursor-pointer shadow-sm outline-none" onChange={e => setFilters({...filters, sede: e.target.value})}><option value="">SEDES</option><option value="SC">SC</option><option value="OD">OD</option></select>
            <select className="border rounded-xl p-2.5 text-[10px] font-black bg-white cursor-pointer shadow-sm outline-none" onChange={e => setFilters({...filters, origen: e.target.value})}><option value="">ORIGEN</option><option value="Interno">Interno</option><option value="Externo">Externo</option></select>
            <select className="border rounded-xl p-2.5 text-[10px] font-black bg-white cursor-pointer shadow-sm outline-none" onChange={e => setFilters({...filters, etapa: e.target.value})}><option value="">ETAPAS</option><option value="VERIFICACION">Verificación</option><option value="REQUERIMIENTO">Requerimiento</option><option value="SEGUIMIENTO">Seguimiento</option><option value="CIERRE">Cierre</option></select>
            <select className="border rounded-xl p-2.5 text-[10px] font-black bg-white border-slate-200 cursor-pointer shadow-sm outline-none" onChange={e => setFilters({...filters, estado: e.target.value})}><option value="">ESTADO</option><option value="PENDIENTE">PENDIENTE</option><option value="EN PROCESO">EN PROCESO</option><option value="RECUPERADO">RECUPERADO</option></select>
            <select className="border rounded-xl p-2.5 text-[10px] font-black bg-white cursor-pointer shadow-sm outline-none" onChange={e => setFilters({...filters, responsable: e.target.value})}><option value="">RESPONSABLE</option>{LISTA_RESPONSABLES.map(r => <option key={r} value={r}>{r}</option>)}</select>
            <div className="flex items-center gap-1 border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 shadow-inner"><Calendar size={12} className="text-slate-400"/><input type="date" className="bg-transparent text-[9px] font-bold outline-none cursor-pointer" onChange={e => setFilters({...filters, fechaInicio: e.target.value})} /><span className="text-slate-300">-</span><input type="date" className="bg-transparent text-[9px] font-bold outline-none cursor-pointer" onChange={e => setFilters({...filters, fechaFin: e.target.value})} /></div>
          </div>
        </header>

        <div className="p-10 overflow-y-auto flex-1 font-sans">
          {view === 'dashboard' ? (
            <div className="space-y-12 animate-in fade-in duration-500 font-sans">
              <div className="grid grid-cols-4 gap-8">
                {[
                  { label: 'TOTAL REGISTROS', val: totalDocs, color: 'text-slate-800', border: 'border-b-blue-500' },
                  { label: 'PENDIENTES', val: docs.filter(d => getEtapaEstado(d).estado === 'PENDIENTE').length, color: 'text-red-600', border: 'border-b-red-500' },
                  { label: 'EN SEGUIMIENTO', val: docs.filter(d => getEtapaEstado(d).estado === 'EN PROCESO').length, color: 'text-orange-500', border: 'border-b-orange-500' },
                  { label: 'RECUPERADOS', val: docs.filter(d => getEtapaEstado(d).estado === 'RECUPERADO').length, color: 'text-green-600', border: 'border-b-green-500' }
                ].map((kpi, i) => (
                  <div key={i} className={`bg-white p-8 rounded-3xl shadow-sm border ${kpi.border} border-b-[6px] flex flex-col gap-2 transition-transform hover:scale-[1.02] shadow-slate-200 shadow-sm`}>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{kpi.label}</p>
                    <h3 className={`text-5xl font-black ${kpi.color}`}>{kpi.val}</h3>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-12 gap-8">
                <div className="col-span-6 bg-white p-10 rounded-4xl border border-slate-100 shadow-sm flex flex-col shadow-slate-200">
                  <h4 className="text-sm font-black text-slate-700 uppercase mb-12 flex items-center gap-2"><BarChart3 size={18} className="text-blue-600"/> Avance por Etapas</h4>
                  <div className="flex-1 flex items-end justify-around gap-6 h-64 border-b border-l border-slate-100 px-6 pb-2 relative font-sans">
                    {['VERIFICACION', 'REQUERIMIENTO', 'SEGUIMIENTO', 'CIERRE'].map((etapa) => {
                      const count = chartData.counts[etapa];
                      const height = (count / chartData.max) * 100;
                      return (
                        <div key={etapa} className="relative flex-1 flex flex-col items-center group">
                          <div className="absolute bottom-[calc(100%+8px)] opacity-0 group-hover:opacity-100 transition-all bg-blue-600 text-white text-[11px] font-black px-3 py-1.5 rounded-xl shadow-xl z-10 whitespace-nowrap">{count} docs</div>
                          <div className="w-full bg-blue-600 rounded-t-xl transition-all duration-500 hover:bg-blue-700 cursor-pointer shadow-lg" style={{ height: `${height}%`, minHeight: count > 0 ? '4px' : '0' }}></div>
                          <p className="absolute -bottom-8 text-[9px] font-black text-slate-400 uppercase text-center w-full tracking-tighter">{etapa}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="col-span-6 bg-blue-600 p-10 rounded-4xl text-white flex items-center justify-between shadow-2xl relative overflow-hidden">
                    <div className="relative z-10">
                        <h4 className="text-xs font-black uppercase opacity-70 tracking-widest mb-2 uppercase">Indicador de Éxito</h4>
                        <h3 className="text-6xl font-black">{totalDocs > 0 ? Math.round((docs.filter(d => getEtapaEstado(d).estado === 'RECUPERADO').length / totalDocs) * 100) : 0}%</h3>
                    </div>
                    <CheckCircle2 size={120} className="opacity-10 absolute -right-4 -bottom-4"/>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-6 font-sans">
                {USUARIOS.map(u => {
                  const uDocs = docs.filter(d => String(d.responsable_verificacion).toUpperCase() === u.user.toUpperCase());
                  const asig = uDocs.length;
                  const recu = uDocs.filter(d => getEtapaEstado(d).estado === 'RECUPERADO').length;
                  const pct = asig > 0 ? Math.round((recu / asig) * 100) : 0;
                  return (
                    <div key={u.user} className="bg-white border border-slate-100 p-8 rounded-[32px] shadow-sm space-y-4 hover:shadow-md transition-all shadow-slate-200 font-sans">
                      <div className="flex justify-between font-black text-slate-700 uppercase text-xs"><span>{u.user}</span><span>{pct}%</span></div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden shadow-inner"><div className="h-full bg-blue-600 transition-all duration-1000 shadow-lg shadow-blue-200" style={{ width: `${pct}%` }}></div></div>
                      <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-tighter"><span>ASIGNADOS: {asig}</span><span>RECUPERADOS: {recu}</span></div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-4xl shadow-sm border border-slate-100 overflow-hidden animate-in fade-in shadow-slate-100">
               <table className="w-full text-left font-sans font-bold font-sans">
                <thead className="bg-slate-50 border-b text-[10px] font-black text-slate-400 uppercase tracking-widest font-sans font-bold">
                  <tr>
                    <th className="p-6 pl-10 w-16 text-center border-r font-sans font-bold"><button onClick={() => { if(selectedIds.length === docs.length && docs.length > 0) setSelectedIds([]); else setSelectedIds(docs.map(d => d.id)); }}><Square size={22} className="text-slate-300 mx-auto"/></button></th>
                    <th className="p-6 font-sans font-bold uppercase">CUT / Documento</th>
                    <th className="p-6 text-center font-sans font-bold uppercase">Sede</th>
                    <th className="p-6 text-center font-sans font-bold uppercase">Origen</th>
                    <th className="p-6 text-center font-sans font-bold uppercase">Etapa / Estado</th>
                    <th className="p-6 text-center font-sans font-bold uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {docs.map(doc => {
                    const status = getEtapaEstado(doc);
                    const isSelected = selectedIds.includes(doc.id);
                    return (
                      <tr key={doc.id} className={`hover:bg-slate-50/80 transition-all ${isSelected ? 'bg-blue-50/50' : ''}`}>
                        <td className="p-6 text-center border-r font-sans"><button onClick={() => toggleSelectDoc(doc.id)}>{isSelected ? <CheckSquare size={22} className="text-blue-600 mx-auto"/> : <Square size={22} className="text-slate-200 mx-auto"/>}</button></td>
                        <td className="p-6 pl-8">
                            <p className="font-black text-slate-800 text-sm font-sans">{doc.cut}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 truncate max-w-[350px] font-sans">{doc.documento}</p>
                        </td>
                        <td className="p-6 text-center font-black text-[10px] text-slate-600 uppercase font-sans font-bold">{doc.sede}</td>
                        <td className="p-6 text-center font-sans font-bold font-bold"><span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase ${doc.origen === 'Interno' ? 'bg-purple-100 text-purple-700 border border-purple-200 shadow-sm' : 'bg-blue-100 text-blue-700 border border-blue-200 shadow-sm'}`}>{doc.origen || 'EXTERNO'}</span></td>
                        <td className="p-6 text-center font-sans"><div className="flex flex-col items-center gap-1 mx-auto font-sans"><span className="text-[9px] font-black bg-slate-200 text-slate-500 px-3 py-1 rounded-lg uppercase tracking-tighter shadow-sm">{status.etapa}</span><span className={`text-[10px] font-black px-4 py-1.5 rounded-xl border shadow-sm uppercase ${status.color}`}>{status.estado}</span></div></td>
                        <td className="p-6 text-center font-sans font-bold"><div className="flex items-center justify-center gap-3">
                            <button onClick={() => { setEditingDoc(doc); setActiveTab(1); }} className="bg-white border-2 border-blue-50 text-blue-600 font-black text-[10px] px-5 py-2.5 rounded-2xl hover:bg-blue-600 hover:text-white transition-all uppercase shadow-sm">Detalles</button>
                            {session.user.toUpperCase() === 'ADMINISTRADOR' && (<button onClick={() => handleDeleteIndividual(doc.id)} className="bg-white border-2 border-red-50 text-red-500 p-2.5 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-sm font-sans font-bold"><Trash2 size={16}/></button>)}
                        </div></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="p-10 bg-slate-50 flex justify-between items-center border-t border-slate-100 font-sans shadow-inner"><p className="text-xs font-black text-slate-400 uppercase tracking-widest font-sans font-sans">Página {page} • Total: {totalDocs}</p>
                <div className="flex gap-4 font-sans font-bold"><button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center hover:bg-blue-600 hover:text-white shadow-sm disabled:opacity-20 transition-all shadow-lg"><ChevronLeft size={20}/></button><button onClick={() => setPage(p => p + 1)} disabled={page * 100 >= totalDocs} className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center hover:bg-blue-600 hover:text-white shadow-sm disabled:opacity-20 transition-all shadow-lg"><ChevronRight size={20}/></button></div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* --- MODAL DETALLES TOTAL (A-AD INTEGRAL) --- */}
      {editingDoc && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center z-[100] p-10 font-sans font-sans font-sans">
          <div className="bg-white rounded-5xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden shadow-2xl border border-white/20">
            <div className="p-10 bg-[#1E293B] text-white flex justify-between items-center shrink-0 font-sans font-sans font-sans">
              <div><h3 className="text-2xl font-black tracking-tight">{editingDoc.cut} • {editingDoc.documento}</h3><p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mt-2 tracking-[0.2em] font-sans">{editingDoc.origen} • {editingDoc.sede}</p></div>
              <button onClick={() => setEditingDoc(null)} className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold transition-transform hover:rotate-90 shadow-xl font-sans">✕</button>
            </div>
            <div className="flex flex-1 overflow-hidden font-sans font-sans font-sans font-sans">
             <div className="w-80 bg-slate-50 border-r p-10 space-y-4 shrink-0 font-sans font-bold">
  {/* Botón 1: Siempre visible */}
  <button onClick={() => setActiveTab(1)} className={`w-full text-left p-6 rounded-3xl font-black text-xs transition-all flex items-center justify-between ${activeTab === 1 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-2xl' : 'text-slate-400'}`}>1. VERIFICACIÓN <UserCheck size={16}/></button>
  
  {/* Etapas 2 y 3: SOLO si el origen es EXTERNO */}
  {String(editingDoc.origen).toUpperCase() === 'EXTERNO' && (
    <>
      <button onClick={() => setActiveTab(2)} className={`w-full text-left p-6 rounded-3xl font-black text-xs transition-all flex items-center justify-between shadow-sm ${activeTab === 2 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-2xl' : 'text-slate-400'}`}>2. REQUERIMIENTO <Truck size={16}/></button>
      <button onClick={() => setActiveTab(3)} className={`w-full text-left p-6 rounded-3xl font-black text-xs transition-all flex items-center justify-between shadow-sm ${activeTab === 3 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-2xl' : 'text-slate-400'}`}>3. SEGUIMIENTO ({seguimientos.length}) <MessageSquare size={16}/></button>
    </>
  )}
  
  {/* Botón 4: FUERA DE LA LLAVE para que aparezca en INTERNOS y EXTERNOS */}
  <button onClick={() => setActiveTab(4)} className={`w-full text-left p-6 rounded-3xl font-black text-xs transition-all flex items-center justify-between shadow-sm ${activeTab === 4 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-2xl' : 'text-slate-400'}`}>4. CIERRE <Save size={16}/></button>
</div>
              <div className="flex-1 p-14 overflow-y-auto bg-white font-sans font-sans font-sans">
                {activeTab === 1 && (
                  <div className="grid grid-cols-2 gap-12 animate-in fade-in duration-300 font-sans">
                    <div className="space-y-3 font-sans font-bold"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 font-sans">Resp. Verificación</label>
                      <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs uppercase cursor-pointer shadow-inner shadow-slate-100 font-sans font-bold" value={editingDoc.responsable_verificacion || ''} onChange={e => setEditingDoc({...editingDoc, responsable_verificacion: e.target.value})}>
                        <option value="">SELECCIONE...</option>{LISTA_RESPONSABLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div className="space-y-3 font-sans"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 font-sans font-bold">Fecha Verificación</label><input type="date" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs shadow-inner shadow-slate-200 shadow-inner font-bold" value={editingDoc.fecha_verificacion || ''} onChange={e => setEditingDoc({...editingDoc, fecha_verificacion: e.target.value})}/></div>
                    <div className="col-span-2 space-y-3 font-sans font-bold"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 font-sans font-bold font-bold">Estado Etapa (Col K)</label><select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs uppercase font-sans font-bold shadow-inner" value={editingDoc.estado_verificacion_k || ''} onChange={e => setEditingDoc({...editingDoc, estado_verificacion_k: e.target.value})}><option value="PENDIENTE">PENDIENTE</option><option value="VERIFICADO">VERIFICADO</option></select></div>
                    <div className="col-span-2 space-y-6 pt-6 text-center font-sans"><p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] font-sans font-bold font-sans font-bold">Estado de Visualización (Col L)</p>
                      <div className="grid grid-cols-2 gap-8 font-sans font-sans font-bold font-bold"><button onClick={() => setEditingDoc({...editingDoc, estado_visualizacion: 'SI SE VISUALIZA'})} className={`p-10 rounded-3xl border-2 font-black text-sm transition-all flex flex-col items-center gap-4 ${editingDoc.estado_visualizacion === 'SI SE VISUALIZA' ? 'border-green-600 bg-green-50 text-green-700 shadow-2xl shadow-green-900/10' : 'border-slate-50 bg-slate-50 text-slate-300 shadow-inner shadow-slate-100'}`}><CheckCircle2 size={32}/> SÍ SE VISUALIZA</button>
                        <button onClick={() => setEditingDoc({...editingDoc, estado_visualizacion: 'NO SE VISUALIZA'})} className={`p-10 rounded-3xl border-2 font-black text-sm transition-all flex flex-col items-center gap-4 ${editingDoc.estado_visualizacion === 'NO SE VISUALIZA' ? 'border-red-600 bg-red-50 text-red-700 shadow-2xl shadow-red-900/10' : 'border-slate-50 bg-slate-50 text-slate-300 shadow-inner shadow-slate-100'}`}><AlertCircle size={32}/> NO SE VISUALIZA</button></div>
                    </div>
                    <div className="col-span-2 space-y-3 font-sans"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 font-sans font-bold">Observaciones (Col M)</label><textarea className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-medium text-xs shadow-inner shadow-slate-200 shadow-inner shadow-slate-200 shadow-slate-100 shadow-inner font-sans font-bold" rows="3" value={editingDoc.observaciones || ''} onChange={e => setEditingDoc({...editingDoc, observaciones: e.target.value})}></textarea></div>
                  </div>
                )}
               {activeTab === 2 && (
                  <div className="grid grid-cols-2 gap-12 animate-in fade-in duration-300 font-sans">
                    <div className="space-y-3 font-sans font-bold">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Responsable del Requerimiento</label>
                      <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs uppercase cursor-pointer shadow-inner" value={editingDoc.responsable_requerimiento || ''} onChange={e => setEditingDoc({...editingDoc, responsable_requerimiento: e.target.value})}>
                        <option value="">SELECCIONE...</option>
                        {LISTA_RESPONSABLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div className="space-y-3 font-sans font-bold">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha de Elaboración</label>
                      <input type="date" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs shadow-inner" value={editingDoc.fecha_elaboracion || ''} onChange={e => setEditingDoc({...editingDoc, fecha_elaboracion: e.target.value})}/>
                    </div>
                    <div className="space-y-3 font-sans font-bold">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Número de Documento Generado</label>
                      <input type="text" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs shadow-inner" value={editingDoc.numero_documento || ''} onChange={e => setEditingDoc({...editingDoc, numero_documento: e.target.value})}/>
                    </div>
                    <div className="space-y-3 font-sans font-bold">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha de Notificación</label>
                      <input type="date" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs shadow-inner" value={editingDoc.fecha_notificacion || ''} onChange={e => setEditingDoc({...editingDoc, fecha_notificacion: e.target.value})}/>
                    </div>
                    <div className="space-y-3 font-sans font-bold">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Medio de Notificación</label>
                      <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs uppercase cursor-pointer shadow-inner" value={editingDoc.medio_notificacion || ''} onChange={e => setEditingDoc({...editingDoc, medio_notificacion: e.target.value})}>
                        <option value="">SELECCIONE...</option>
                        <option value="DIGITAL">DIGITAL</option>
                        <option value="COURIER">COURIER</option>
                      </select>
                    </div>
                    <div className="col-span-1 bg-blue-50 p-10 rounded-4xl border border-blue-100 flex items-center justify-between shadow-inner">
                      <div>
                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Días Hábiles Transcurridos</p>
                        <p className="text-6xl font-black text-blue-600 mt-2">{calcularDiasHabiles(editingDoc.fecha_notificacion)}</p>
                      </div>
                      <Clock size={80} className="text-blue-200 opacity-50"/>
                    </div>
                    <div className="col-span-2 space-y-3 font-sans font-bold">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Observaciones Requerimiento</label>
                      <textarea className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-medium text-xs shadow-inner" rows="2" value={editingDoc.observaciones_requerimiento || ''} onChange={e => setEditingDoc({...editingDoc, observaciones_requerimiento: e.target.value})}></textarea>
                    </div>
                  </div>
                )}

               {activeTab === 3 && (
                  <div className="space-y-12 animate-in fade-in duration-300 font-sans">
                    <div className="bg-slate-50 p-10 rounded-4xl space-y-6 border border-slate-200">
                      <h4 className="font-black text-xs uppercase text-slate-600 tracking-widest">Registrar Nuevo Seguimiento</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase">Fecha</label>
                          <input type="date" id="s_fec" className="w-full p-4 rounded-2xl border bg-white font-bold text-xs shadow-inner outline-none" defaultValue={new Date().toISOString().split('T')[0]} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase">Responsable</label>
                          <select className="w-full p-5 rounded-2xl border bg-white font-black text-[10px] uppercase shadow-inner outline-none" id="s_res">
                            <option value="">SELECCIONE...</option>
                            {LISTA_RESPONSABLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase">Medio</label>
                          <select className="w-full p-5 rounded-2xl border bg-white font-black text-[10px] uppercase shadow-inner outline-none" id="s_med">
                            <option value="">MEDIO...</option>
                            <option value="LLAMADA">LLAMADA</option>
                            <option value="WHATSAPP">WHATSAPP</option>
                            <option value="CORREO">CORREO</option>
                          </select>
                        </div>
                      </div>
                      <textarea id="s_obs" className="w-full p-6 rounded-3xl border border-slate-100 bg-white text-sm outline-none shadow-inner font-medium" rows="3" placeholder="Detalles del contacto con el remitente..."></textarea>
                      
                      {/* BOTÓN CORREGIDO - SIN ERROR DE SINTAXIS */}
                      <button 
                        onClick={async () => {
                          const o = document.getElementById('s_obs').value; 
                          const r = document.getElementById('s_res').value; 
                          const m = document.getElementById('s_med').value; 
                          const f = document.getElementById('s_fec').value;
                          
                          if(!o || !r || !m || !f) return alert("Por favor, complete todos los campos.");
                          
                          try {
                            const now = new Date().toISOString();
                            const { error: insertError } = await supabase.from('seguimientos').insert([
                              { documento_id: editingDoc.id, responsable: r, medio: m, observaciones: o, fecha: f }
                            ]);
                            
                            if(insertError) throw insertError;

                            // 1. Actualizar base de datos
                            await supabase.from('documentos').update({ ultimo_seguimiento: now }).eq('id', editingDoc.id); 
                            
                            // 2. ACTUALIZACIÓN LOCAL: Esto hace que el estado cambie a "EN PROCESO" al instante
                            setEditingDoc(prev => ({ ...prev, ultimo_seguimiento: now }));
                            
                            document.getElementById('s_obs').value = ''; 
                            alert("Seguimiento Grabado"); 

                            // 3. Recargar historial
                            const { data: newData } = await supabase.from('seguimientos').select('*').eq('documento_id', editingDoc.id).order('fecha', { ascending: false });
                            setSeguimientos(newData || []);
                            
                            // 4. Refrescar tabla del fondo
                            fetchDocs(); 
                          } catch (err) {
                            alert("Error: " + err.message);
                          }
                        }} 
                        className="bg-blue-600 text-white font-black py-5 px-12 rounded-3xl text-xs uppercase shadow-2xl shadow-blue-200 tracking-[0.2em] hover:scale-105 transition-all outline-none"
                      >
                        Grabar Seguimiento
                      </button>
                    </div>
                    <div className="space-y-8">
                      <h4 className="font-black text-[10px] uppercase text-slate-400 tracking-widest ml-4">Historial de Seguimientos ({seguimientos.length})</h4>
                      {seguimientos.map(s => (
                        <div key={s.id} className="p-8 border border-slate-100 rounded-3xl flex items-start gap-6 bg-white shadow-sm hover:shadow-md transition-shadow">
                          <div className="bg-blue-100 p-4 rounded-2xl text-blue-600 shrink-0 shadow-inner"><MessageSquare size={24}/></div>
                          <div className="flex-1 font-sans">
                            <div className="flex justify-between items-center mb-2">
                              <p className="text-xs font-black text-slate-800 uppercase tracking-widest">{s.responsable}</p>
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full">{s.fecha.split('-').reverse().join('/')}</span>
                            </div>
                            <p className="text-[10px] font-black text-blue-600 uppercase mb-2">Canal: {s.medio}</p>
                            <p className="text-sm text-slate-500 font-medium italic">"{s.observaciones}"</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 4 && (
  <div className="grid grid-cols-2 gap-12 animate-in fade-in duration-300 font-sans">
    <div className="col-span-2 bg-emerald-50 p-12 rounded-[45px] border border-emerald-100 flex items-center gap-8 shadow-inner font-sans font-sans">
       <input type="checkbox" className="w-12 h-12 accent-emerald-600 rounded-2xl shadow-sm cursor-pointer hover:scale-110 transition-transform shadow-lg" checked={editingDoc.cargado_sisged} onChange={e => setEditingDoc({...editingDoc, cargado_sisged: e.target.checked})}/>
       <div>
         <label className="font-black text-emerald-900 uppercase text-xs tracking-[0.2em] block mb-1">Cargado en SISGED (Col AB)</label>
         <p className="text-[10px] text-emerald-700 font-bold opacity-60">Marque para finalizar documento como RECUPERADO.</p>
       </div>
    </div>
    <div className="space-y-3 font-sans font-bold">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado Final de Recuperación (Col AC)</label>
      <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs uppercase cursor-pointer shadow-inner font-bold" value={editingDoc.estado_final || 'PENDIENTE'} onChange={e => setEditingDoc({...editingDoc, estado_final: e.target.value})}>
        <option value="PENDIENTE">PENDIENTE</option>
        <option value="RECUPERADO">RECUPERADO</option>
        <option value="RECONSTRUCCION">RECONSTRUCCION</option>
      </select>
    </div>
    <div className="space-y-3 font-sans font-bold">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Oficina de Destino (Col AA)</label>
      <input type="text" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs shadow-inner shadow-slate-200" value={editingDoc.oficina_destino || ''} onChange={e => setEditingDoc({...editingDoc, oficina_destino: e.target.value})}/>
    </div>
    <div className="space-y-3 font-sans font-bold">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Remisión (Col W)</label>
      <input type="date" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs shadow-inner shadow-slate-200" value={editingDoc.fecha_remision || ''} onChange={e => setEditingDoc({...editingDoc, fecha_remision: e.target.value})}/>
    </div>
    <div className="space-y-3 font-sans font-bold">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Resp. Devolución (Col X)</label>
      <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs uppercase cursor-pointer shadow-inner shadow-slate-200" value={editingDoc.responsable_devolucion || ''} onChange={e => setEditingDoc({...editingDoc, responsable_devolucion: e.target.value})}>
        <option value="">SELECCIONE...</option>
        {LISTA_RESPONSABLES.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
    </div>
    <div className="space-y-3 font-sans font-bold">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Devolución (Col Y)</label>
      <input type="date" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs shadow-inner shadow-slate-200" value={editingDoc.fecha_devolucion || ''} onChange={e => setEditingDoc({...editingDoc, fecha_devolucion: e.target.value})}/>
    </div>
    <div className="space-y-3 font-sans font-bold">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">N° Documento Cierre (Col Z)</label>
      <input type="text" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs shadow-inner shadow-slate-200" value={editingDoc.documento_cierre || ''} onChange={e => setEditingDoc({...editingDoc, documento_cierre: e.target.value})}/>
    </div>
    <div className="col-span-2 space-y-3 font-sans font-bold">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Observaciones Finales (Col AD)</label>
      <textarea className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-medium text-xs shadow-inner shadow-slate-200" rows="3" value={editingDoc.observaciones_finales || ''} onChange={e => setEditingDoc({...editingDoc, observaciones_finales: e.target.value})}></textarea>
    </div>
  </div>
)}
              </div>
            </div>
            <div className="p-10 bg-slate-50 border-t flex justify-end gap-6 shrink-0 font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans"><button onClick={() => setEditingDoc(null)} className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-10 hover:text-slate-700 font-sans font-sans">Descartar</button>
            <button onClick={handleSyncChanges} className="bg-brand-blue text-white px-16 py-5 rounded-3xl font-black text-xs uppercase shadow-2xl tracking-[0.2em] hover:scale-[1.02] active:scale-95 transition-all outline-none font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">SINCRONIZAR CAMBIOS</button></div>
          </div>
        </div>
      )}

      {/* --- MODAL NUEVO --- */}
      {isNewModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl flex items-center justify-center z-[110] p-6 animate-in zoom-in duration-300 font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">
          <div className="bg-white rounded-5xl w-full max-w-xl shadow-2xl p-12 space-y-10 border border-white relative font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">
            <button onClick={() => setIsNewModalOpen(false)} className="absolute right-8 top-8 text-slate-300 hover:text-slate-600 transition-colors font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans"><X/></button>
            <h3 className="text-2xl font-black uppercase text-center tracking-tighter text-slate-800 tracking-[0.1em] font-sans font-sans font-sans font-sans font-sans font-sans">Nuevo Expediente</h3>
            <div className="grid grid-cols-2 gap-6 font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">
              <input type="text" placeholder="CUT" className="w-full p-5 bg-slate-50 border-none rounded-3xl outline-none font-bold shadow-inner font-sans font-sans font-sans font-sans" id="n_cut" />
              <input type="text" placeholder="Documento" className="w-full p-5 bg-slate-50 border-none rounded-3xl outline-none font-bold shadow-inner font-sans font-sans font-sans font-sans font-sans" id="n_doc" />
              <input type="text" placeholder="Remitente" className="w-full p-5 bg-slate-50 border-none rounded-3xl outline-none font-bold shadow-inner col-span-2 shadow-slate-200 font-sans font-sans font-sans font-sans font-sans" id="n_rem" />
              <input type="date" className="w-full p-5 bg-slate-50 border-none rounded-3xl font-bold shadow-inner col-span-2 outline-none font-sans font-sans shadow-slate-100 font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans" id="n_fecha" />
              <div className="relative col-span-2 font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans"><Phone size={16} className="absolute left-4 top-5 text-slate-300 font-sans font-sans font-sans font-sans font-sans font-sans"/><input type="text" placeholder="Celular" className="w-full p-5 pl-12 bg-slate-50 border-none rounded-3xl outline-none font-bold shadow-inner font-sans font-sans font-sans font-sans font-sans font-sans font-sans" id="n_cel" /></div>
              <div className="relative col-span-2 font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans"><Briefcase size={16} className="absolute left-4 top-5 text-slate-300 font-sans font-sans font-sans font-sans font-sans font-sans"/><input type="text" placeholder="Procedimiento TUPA" className="w-full p-5 pl-12 bg-slate-50 border-none rounded-3xl outline-none font-bold shadow-inner font-sans font-sans font-sans font-sans font-sans font-sans font-sans" id="n_proc" /></div>
              <select className="w-full p-5 bg-slate-50 border-none rounded-3xl font-black text-[10px] uppercase shadow-inner cursor-pointer font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans" id="n_sede"><option value="SC">SEDE CENTRAL (SC)</option><option value="OD">ÓRGANO DESCONCENTRADO (OD)</option></select>
              <select className="w-full p-5 bg-slate-50 border-none rounded-3xl font-black text-[10px] uppercase shadow-inner cursor-pointer font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans" id="n_origen"><option value="Externo">Externo</option><option value="Interno">Interno</option></select>
            </div>
            <button onClick={async () => {
              const doc = { cut: document.getElementById('n_cut').value, documento: document.getElementById('n_doc').value, remitente: document.getElementById('n_rem').value, fecha_registro: document.getElementById('n_fecha').value, celular: document.getElementById('n_cel').value, procedimiento: document.getElementById('n_proc').value, sede: document.getElementById('n_sede').value, origen: document.getElementById('n_origen').value, etapa_actual: 'VERIFICACION', estado_final: 'PENDIENTE', creado_at: new Date().toISOString() };
              const { error } = await supabase.from('documentos').insert([doc]);
              if (!error) { setIsNewModalOpen(false); fetchDocs(); } else alert("Error (Verifique si CUT+Doc duplicado)");
            }} className="w-full bg-brand-blue text-white py-6 rounded-3xl font-black uppercase shadow-2xl tracking-[0.3em] hover:bg-blue-700 transition-all outline-none font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">Registrar Documento</button>
          </div>
        </div>
      )}
    </div>
  );
}
