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

// --- CONFIGURACIÓN DE USUARIOS ---
const USUARIOS = [
  { user: 'ADMINISTRADOR', pass: 'admin123' },
  { user: 'YANINA', pass: '123456' },
  { user: 'CESAR', pass: '123456' },
  { user: 'XINA', pass: '123456' },
  { user: 'FERNANDO', pass: '123456' }
];

const LISTA_RESPONSABLES = ["ADMINISTRADOR", "YANINA", "CESAR", "XINA", "FERNANDO"];

export default function SistemaSIGERED() {
  // --- ESTADOS ---
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
  
  // --- FILTROS GLOBALES ---
  const [filters, setFilters] = useState({ 
    search: '', sede: '', origen: '', estado: '', etapa: '', responsable: '', fechaInicio: '', fechaFin: '' 
  });

  const ITEMS_PER_PAGE = 100;

  // --- 1. LÓGICA DE NEGOCIO ANALÍTICA (ANÁLISIS DE COLUMNAS K, L, P, AB) ---
  const getEtapaEstado = useCallback((doc) => {
    if (!doc) return { etapa: '-', estado: '-', color: 'bg-slate-100', border: 'border-slate-300' };
    
    const origen = String(doc.origen).toUpperCase();
    const colK = String(doc.estado_verificacion_k || 'PENDIENTE').toUpperCase();
    const colL = String(doc.estado_visualizacion || '').toUpperCase();
    const colP = doc.numero_documento;
    const colAB = doc.cargado_sisged;

    // REGLA PRIORIDAD 1: ¿Se cargó al SISGED? (Col AB) -> CIERRE / RECUPERADO
    if (colAB === true || colAB === 'true') return { etapa: 'CIERRE', estado: 'RECUPERADO', color: 'bg-green-100 text-green-700', border: 'border-green-500' };

    // REGLA PRIORIDAD 2: Etapa 1 Verificación -> Si se visualiza (Col L) -> CIERRE / RECUPERADO
    if (colL === 'SI SE VISUALIZA') return { etapa: 'CIERRE', estado: 'RECUPERADO', color: 'bg-green-100 text-green-700', border: 'border-green-500' };

    // REGLA PRIORIDAD 3: Etapa 1 Verificación -> No se visualiza (Col L)
    if (colL === 'NO SE VISUALIZA') {
        if (origen === 'INTERNO') {
            return { etapa: 'CIERRE', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
        } else {
            // DOCUMENTOS EXTERNOS: REQUERIMIENTO / SEGUIMIENTO
            if (!colP) return { etapa: 'REQUERIMIENTO', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
            
            // Si tiene número de documento (Col P) pero se evalúan seguimientos
            if (doc.ultimo_seguimiento) {
                return { etapa: 'SEGUIMIENTO', estado: 'EN PROCESO', color: 'bg-orange-100 text-orange-700', border: 'border-orange-500' };
            }
            return { etapa: 'SEGUIMIENTO', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
        }
    }

    // ESTADO POR DEFECTO: VERIFICACION / PENDIENTE (Col K = PENDIENTE)
    return { etapa: 'VERIFICACION', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
  }, []);

  // --- 2. CÁLCULOS TÉCNICOS ---
  const calcularDiasHabiles = (fechaRef) => {
    if (!fechaRef) return 0;
    let start = new Date(fechaRef);
    let end = new Date();
    if (start > end) return 0;
    let count = 0;
    while (start <= end) {
      if (start.getDay() !== 0 && start.getDay() !== 6) count++;
      start.setDate(start.getDate() + 1);
    }
    return count;
  };

  const formatExcelDate = (val) => {
    if (!val) return null;
    if (typeof val === 'number') return new Date((val - 25569) * 86400 * 1000).toISOString().split('T')[0];
    if (typeof val === 'string' && val.includes('/')) {
        const p = val.split('/');
        return `${p[2]}-${p[1]}-${p[0]}`;
    }
    return val;
  };

  // --- 3. GESTIÓN DE DATOS (IMPORTACIÓN A-AD COMPLETA) ---
  const fetchDocs = useCallback(async () => {
    setLoading(true);
    let from = (page - 1) * ITEMS_PER_PAGE;
    let to = from + ITEMS_PER_PAGE - 1;
    let query = supabase.from('documentos').select('*', { count: 'exact' });

    if (filters.search) query = query.or(`cut.ilike.%${filters.search}%,documento.ilike.%${filters.search}%`);
    if (filters.sede) query = query.eq('sede', filters.sede);
    if (filters.origen) query = query.eq('origen', filters.origen);
    if (filters.responsable) query = query.eq('responsable_verificacion', filters.responsable);
    
    // Filtros por Etapa y Estado basados en lógica DB
    if (filters.etapa) {
      if (filters.etapa === 'VERIFICACION') query = query.eq('estado_verificacion_k', 'PENDIENTE');
      if (filters.etapa === 'REQUERIMIENTO') query = query.eq('estado_verificacion_k', 'VERIFICADO').is('numero_documento', null);
      if (filters.etapa === 'CIERRE') query = query.or('cargado_sisged.eq.true,estado_visualizacion.eq.SI SE VISUALIZA');
    }
    if (filters.estado === 'RECUPERADO') query = query.or('cargado_sisged.eq.true,estado_visualizacion.eq.SI SE VISUALIZA');
    if (filters.estado === 'EN PROCESO') query = query.not('ultimo_seguimiento', 'is', null).eq('cargado_sisged', false);
    if (filters.estado === 'PENDIENTE') query = query.eq('cargado_sisged', false).neq('estado_visualizacion', 'SI SE VISUALIZA').is('ultimo_seguimiento', null);

    const { data, count, error } = await query.order('creado_at', { ascending: false }).range(from, to);
    if (!error) { setDocs(data || []); setTotalDocs(count || 0); }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { if (session) fetchDocs(); }, [session, fetchDocs]);

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const batch = data.slice(1).map(row => {
        if (!row[1]) return null;
        return {
          sede: row[0], cut: String(row[1]), documento: String(row[2]), remitente: row[3], fecha_registro: formatExcelDate(row[4]),
          origen: row[5], procedimiento: row[6], celular: String(row[7] || ''), responsable_verificacion: String(row[8] || '').toUpperCase(),
          fecha_verificacion: formatExcelDate(row[9]), estado_verificacion_k: row[10], estado_visualizacion: row[11], observaciones: row[12],
          responsable_requerimiento: String(row[13] || '').toUpperCase(), fecha_elaboracion: formatExcelDate(row[14]), numero_documento: String(row[15] || ''),
          fecha_notificacion: formatExcelDate(row[16]), medio_notificacion: row[17], fecha_remision: formatExcelDate(row[22]),
          responsable_devolucion: String(row[23] || '').toUpperCase(), fecha_devolucion: formatExcelDate(row[24]), documento_cierre: String(row[25] || ''),
          oficina_destino: row[26], cargado_sisged: String(row[27]).toUpperCase() === 'SI', estado_final: row[28] || 'PENDIENTE',
          observaciones_finales: row[29], creado_at: new Date().toISOString()
        };
      }).filter(Boolean);
      await supabase.from('documentos').upsert(batch, { onConflict: 'cut,documento' });
      fetchDocs();
    };
    reader.readAsBinaryString(file);
    e.target.value = null;
  };

  const handleSyncChanges = async () => {
    if (!editingDoc) return;
    setLoading(true);
    const { id, creado_at, ultimo_seguimiento, ...updateData } = editingDoc;
    const { error } = await supabase.from('documentos').update(updateData).eq('id', id);
    if (!error) { alert('Sincronización Exitosa'); setEditingDoc(null); fetchDocs(); }
    else { alert('Error: ' + error.message); }
    setLoading(false);
  };

  const handleDeleteIndividual = async (id) => {
    if (confirm("¿Eliminar este registro permanentemente?")) {
      await supabase.from('documentos').delete().eq('id', id);
      fetchDocs();
    }
  };

  const handleBulkDelete = async () => {
    if (confirm(`¿Eliminar ${selectedIds.length} registros seleccionados?`)) {
      await supabase.from('documentos').delete().in('id', selectedIds);
      setSelectedIds([]); fetchDocs();
    }
  };

  const toggleSelectDoc = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(docs);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SIGERED_REPORTE");
    XLSX.writeFile(wb, "Reporte_SIGERED.xlsx");
  };

  // --- 4. DASHBOARD Y GRÁFICO (BARRAS 50%) ---
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
        <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden border border-white">
          <div className="bg-[#2563EB] p-12 text-center text-white font-sans">
             <h1 className="text-4xl font-black mb-2 tracking-tighter uppercase">SIGERED</h1>
             <p className="text-xs uppercase font-bold tracking-widest opacity-80">Gestión de Recuperación</p>
          </div>
          <form onSubmit={handleLogin} className="p-10 space-y-6">
            <input type="text" placeholder="Usuario" className="w-full p-5 bg-slate-50 border rounded-3xl outline-none font-bold" onChange={e => setLoginData({...loginData, user: e.target.value})} required />
            <input type="password" placeholder="Contraseña" className="w-full p-5 bg-slate-50 border rounded-3xl outline-none font-bold" onChange={e => setLoginData({...loginData, pass: e.target.value})} required />
            <button type="submit" className="w-full bg-[#2563EB] text-white py-5 rounded-3xl font-black shadow-xl hover:bg-blue-700 transition-all uppercase">Iniciar Sesión</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex text-slate-900 font-sans">
      {/* SIDEBAR */}
      <aside className="w-64 bg-[#1E293B] text-slate-400 flex flex-col fixed h-full z-20 shadow-2xl">
        <div className="p-8 font-black text-white text-2xl tracking-tighter">SIGERED</div>
        <nav className="flex-1 p-4 space-y-2 mt-4">
          <button onClick={() => setView('dashboard')} className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all ${view === 'dashboard' ? 'bg-[#2563EB] text-white shadow-lg shadow-blue-900/40' : 'hover:bg-slate-800'}`}><LayoutDashboard size={18}/> Dashboard</button>
          <button onClick={() => setView('list')} className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all ${view === 'list' ? 'bg-[#2563EB] text-white shadow-lg shadow-blue-900/40' : 'hover:bg-slate-800'}`}><FileText size={18}/> Gestión</button>
        </nav>
        <div className="p-6 border-t border-slate-800 flex items-center gap-3 bg-slate-900/50">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-white shadow-inner uppercase">{session.user[0]}</div>
          <div className="flex-1 overflow-hidden font-sans"><p className="text-xs font-bold text-white truncate uppercase">{session.user}</p><p className="text-[10px] uppercase font-bold text-slate-500">En Línea</p></div>
          <button onClick={() => setSession(null)}><LogOut size={18}/></button>
        </div>
      </aside>

      <main className="ml-64 flex-1 flex flex-col h-screen overflow-hidden">
        {/* HEADER CON BOTONES Y FILTROS TOTALES */}
        <header className="bg-white border-b p-4 flex flex-wrap items-center gap-3 sticky top-0 z-10 px-8 shadow-sm h-auto min-h-[80px]">
          <div className="flex gap-2 mr-auto">
            <button onClick={() => setIsNewModalOpen(true)} className="bg-[#2563EB] text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-blue-700 shadow-sm"><Plus size={14}/> Nuevo</button>
            <label className="bg-white border border-slate-200 px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer hover:bg-slate-50 shadow-sm"><Upload size={14}/> Importar <input type="file" className="hidden" onChange={handleImport}/></label>
            <button onClick={handleExport} className="bg-white border border-slate-200 px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-slate-50 shadow-sm"><Download size={14}/> Reporte</button>
            {selectedIds.length > 0 && <button onClick={handleBulkDelete} className="bg-red-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg"><Trash2 size={14}/> Eliminar ({selectedIds.length})</button>}
          </div>
          
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <div className="relative"><Search size={14} className="absolute left-3 top-3 text-slate-400"/><input type="text" placeholder="Buscar CUT..." className="bg-slate-50 border-none rounded-xl pl-9 pr-4 py-2.5 text-xs w-32 outline-none focus:ring-2 focus:ring-blue-500" onChange={e => setFilters({...filters, search: e.target.value})}/></div>
            <select className="border rounded-xl p-2.5 text-[10px] font-black uppercase bg-white border-slate-200 outline-none cursor-pointer" onChange={e => setFilters({...filters, sede: e.target.value})}><option value="">SEDES</option><option value="SC">SC</option><option value="OD">OD</option></select>
            <select className="border rounded-xl p-2.5 text-[10px] font-black uppercase bg-white border-slate-200 outline-none cursor-pointer" onChange={e => setFilters({...filters, origen: e.target.value})}><option value="">ORIGEN</option><option value="Interno">Interno</option><option value="Externo">Externo</option></select>
            <select className="border rounded-xl p-2.5 text-[10px] font-black uppercase bg-white border-slate-200 outline-none cursor-pointer" onChange={e => setFilters({...filters, etapa: e.target.value})}><option value="">ETAPAS</option><option value="VERIFICACION">Verificación</option><option value="REQUERIMIENTO">Requerimiento</option><option value="SEGUIMIENTO">Seguimiento</option><option value="CIERRE">Cierre</option></select>
            <select className="border rounded-xl p-2.5 text-[10px] font-black uppercase bg-white border-slate-200 outline-none cursor-pointer shadow-sm" onChange={e => setFilters({...filters, estado: e.target.value})}><option value="">ESTADO</option><option value="PENDIENTE">PENDIENTE</option><option value="EN PROCESO">EN PROCESO</option><option value="RECUPERADO">RECUPERADO</option></select>
            <select className="border rounded-xl p-2.5 text-[10px] font-black uppercase bg-white border-slate-200 outline-none cursor-pointer" onChange={e => setFilters({...filters, responsable: e.target.value})}><option value="">RESPONSABLE</option>{LISTA_RESPONSABLES.map(r => <option key={r} value={r}>{r}</option>)}</select>
            <div className="flex items-center gap-1 border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50"><Calendar size={12} className="text-slate-400"/><input type="date" className="bg-transparent text-[9px] font-bold outline-none" onChange={e => setFilters({...filters, fechaInicio: e.target.value})} /><span className="text-slate-300">-</span><input type="date" className="bg-transparent text-[9px] font-bold outline-none" onChange={e => setFilters({...filters, fechaFin: e.target.value})} /></div>
          </div>
        </header>

        <div className="p-10 overflow-y-auto flex-1 font-sans">
          {view === 'dashboard' ? (
            <div className="space-y-12 animate-in fade-in duration-500 font-sans">
              {/* KPIs ( DISEÑO IMAGEN SOLICITADA ) */}
              <div className="grid grid-cols-4 gap-8">
                {[
                  { label: 'TOTAL REGISTROS', val: totalDocs, color: 'text-slate-800', border: 'border-b-blue-500' },
                  { label: 'PENDIENTES', val: docs.filter(d => getEtapaEstado(d).estado === 'PENDIENTE').length, color: 'text-red-600', border: 'border-b-red-500' },
                  { label: 'EN SEGUIMIENTO', val: docs.filter(d => getEtapaEstado(d).estado === 'EN PROCESO').length, color: 'text-orange-500', border: 'border-b-orange-500' },
                  { label: 'RECUPERADOS', val: docs.filter(d => getEtapaEstado(d).estado === 'RECUPERADO').length, color: 'text-green-600', border: 'border-b-green-500' }
                ].map((kpi, i) => (
                  <div key={i} className={`bg-white p-8 rounded-3xl shadow-sm border ${kpi.border} border-b-[6px] flex flex-col gap-2 transition-transform hover:scale-[1.02]`}>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{kpi.label}</p>
                    <h3 className={`text-5xl font-black ${kpi.color}`}>{kpi.val}</h3>
                  </div>
                ))}
              </div>

              {/* GRÁFICO BARRAS 50% CON TOOLTIPS */}
              <div className="grid grid-cols-12 gap-8">
                <div className="col-span-6 bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm flex flex-col">
                  <h4 className="text-sm font-black text-slate-700 uppercase mb-12 flex items-center gap-2"><BarChart3 size={18} className="text-blue-600"/> Avance por Etapas</h4>
                  <div className="flex-1 flex items-end justify-around gap-6 h-64 border-b border-l border-slate-100 px-6 pb-2 relative font-sans">
                    {['VERIFICACION', 'REQUERIMIENTO', 'SEGUIMIENTO', 'CIERRE'].map((etapa) => {
                      const count = chartData.counts[etapa];
                      const height = (count / chartData.max) * 100;
                      return (
                        <div key={etapa} className="relative flex-1 flex flex-col items-center group">
                          {/* TOOLTIP HOVER DINÁMICO */}
                          <div className="absolute bottom-[calc(100%+8px)] opacity-0 group-hover:opacity-100 transition-all bg-blue-600 text-white text-[11px] font-black px-3 py-1.5 rounded-xl shadow-xl z-10 whitespace-nowrap">{count} docs</div>
                          <div className="w-full bg-blue-600 rounded-t-xl transition-all duration-500 hover:bg-blue-700 cursor-pointer shadow-lg" style={{ height: `${height}%`, minHeight: count > 0 ? '4px' : '0' }}></div>
                          <p className="absolute -bottom-8 text-[9px] font-black text-slate-400 uppercase text-center w-full tracking-tighter">{etapa}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="col-span-6 bg-blue-600 p-10 rounded-[40px] text-white flex items-center justify-between shadow-2xl shadow-blue-900/30 overflow-hidden relative">
                    <div className="relative z-10">
                        <h4 className="text-xs font-black uppercase opacity-70 tracking-widest mb-2 tracking-[0.2em]">Indicador de Éxito</h4>
                        <h3 className="text-6xl font-black font-sans">{totalDocs > 0 ? Math.round((docs.filter(d => getEtapaEstado(d).estado === 'RECUPERADO').length / totalDocs) * 100) : 0}%</h3>
                    </div>
                    <CheckCircle2 size={120} className="opacity-10 absolute -right-4 -bottom-4"/>
                </div>
              </div>

              {/* AVANCE USUARIOS FILTRABLE POR FECHA */}
              <div className="grid grid-cols-3 gap-6 font-sans">
                {USUARIOS.map(u => {
                  const uDocs = docs.filter(d => {
                    const matchUser = d.responsable_verificacion === u.user.toUpperCase();
                    if (!matchUser) return false;
                    if (filters.fechaInicio && d.fecha_registro < filters.fechaInicio) return false;
                    if (filters.fechaFin && d.fecha_registro > filters.fechaFin) return false;
                    return true;
                  });
                  const asig = uDocs.length;
                  const recu = uDocs.filter(d => getEtapaEstado(d).estado === 'RECUPERADO').length;
                  const pct = asig > 0 ? Math.round((recu / asig) * 100) : 0;
                  return (
                    <div key={u.user} className="bg-white border border-slate-100 p-8 rounded-[32px] shadow-sm space-y-4 hover:shadow-md transition-all">
                      <div className="flex justify-between font-black text-slate-700 uppercase text-xs"><span>{u.user}</span><span>{pct}%</span></div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-600 transition-all duration-1000" style={{ width: `${pct}%` }}></div></div>
                      <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-tighter font-sans"><span>ASIGNADOS: {asig}</span><span>RECUPERADOS: {recu}</span></div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            /* TABLA GESTIÓN CON SELECCIÓN MASIVA HABILITADA */
            <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 overflow-hidden animate-in fade-in">
               <table className="w-full text-left border-collapse font-sans">
                <thead className="bg-slate-50 border-b text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="p-6 pl-10 w-16 text-center border-r">
                        <button onClick={() => { if(selectedIds.length === docs.length && docs.length > 0) setSelectedIds([]); else setSelectedIds(docs.map(d => d.id)); }}>
                           {selectedIds.length === docs.length && docs.length > 0 ? <CheckSquare size={22} className="text-blue-600 mx-auto"/> : <Square size={22} className="text-slate-300 mx-auto"/>}
                        </button>
                    </th>
                    <th className="p-6">CUT / Documento</th>
                    <th className="p-6 text-center">Sede</th>
                    <th className="p-6 text-center">Origen</th>
                    <th className="p-6 text-center">Etapa / Estado</th>
                    <th className="p-6 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {docs.map(doc => {
                    const status = getEtapaEstado(doc);
                    const isSelected = selectedIds.includes(doc.id);
                    return (
                      <tr key={doc.id} className={`hover:bg-slate-50/80 transition-all ${isSelected ? 'bg-blue-50/50' : ''}`}>
                        <td className="p-6 text-center border-r"><button onClick={() => toggleSelectDoc(doc.id)}>{isSelected ? <CheckSquare size={22} className="text-blue-600 mx-auto"/> : <Square size={22} className="text-slate-200 mx-auto"/>}</button></td>
                        <td className="p-6 pl-8">
                            <p className="font-black text-slate-800 text-sm">{doc.cut}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 truncate max-w-[350px]">{doc.documento}</p>
                        </td>
                        <td className="p-6 text-center font-black text-[10px] text-slate-600 uppercase font-sans">{doc.sede}</td>
                        <td className="p-6 text-center font-sans"><span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase ${doc.origen === 'Interno' ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}>{doc.origen || 'EXTERNO'}</span></td>
                        <td className="p-6 text-center">
                           <div className="flex flex-col items-center gap-1 mx-auto font-sans"><span className="text-[9px] font-black bg-slate-200 text-slate-500 px-3 py-1 rounded-lg uppercase tracking-tighter">{status.etapa}</span><span className={`text-[10px] font-black px-4 py-1.5 rounded-xl border shadow-sm uppercase ${status.color}`}>{status.estado}</span></div>
                        </td>
                        <td className="p-6 text-center">
                          <div className="flex items-center justify-center gap-3">
                             <button onClick={() => { setEditingDoc(doc); setActiveTab(1); }} className="bg-white border-2 border-blue-50 text-blue-600 font-black text-[10px] px-5 py-2.5 rounded-2xl hover:bg-blue-600 hover:text-white transition-all uppercase tracking-widest shadow-sm">Detalles</button>
                             {session.user === 'ADMINISTRADOR' && (<button onClick={() => handleDeleteIndividual(doc.id)} className="bg-white border-2 border-red-50 text-red-500 p-2.5 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-sm"><Trash2 size={16}/></button>)}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="p-10 bg-slate-50 flex justify-between items-center border-t border-slate-100"><p className="text-xs font-black text-slate-400 uppercase tracking-widest">Página {page} • Total: {totalDocs}</p>
                <div className="flex gap-4"><button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center hover:bg-blue-600 hover:text-white shadow-sm disabled:opacity-20 transition-all shadow-lg"><ChevronLeft size={20}/></button><button onClick={() => setPage(p => p + 1)} disabled={page * 100 >= totalDocs} className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center hover:bg-blue-600 hover:text-white shadow-sm disabled:opacity-20 transition-all shadow-lg"><ChevronRight size={20}/></button></div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* --- MODAL DETALLES TOTAL (A-AD INTEGRAL) --- */}
      {editingDoc && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center z-[100] p-10 font-sans">
          <div className="bg-white rounded-[50px] w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden shadow-2xl border border-white/20">
            <div className="p-10 bg-[#1E293B] text-white flex justify-between items-center shrink-0">
              <div><h3 className="text-2xl font-black tracking-tight">{editingDoc.cut} • {editingDoc.documento}</h3><p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mt-2">{editingDoc.origen} • {editingDoc.sede}</p></div>
              <button onClick={() => setEditingDoc(null)} className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold transition-transform hover:rotate-90">✕</button>
            </div>
            <div className="flex flex-1 overflow-hidden font-sans">
              <div className="w-80 bg-slate-50 border-r p-10 space-y-4 shrink-0 font-sans">
                <button onClick={() => setActiveTab(1)} className={`w-full text-left p-6 rounded-[30px] font-black text-xs transition-all flex items-center justify-between ${activeTab === 1 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-2xl' : 'text-slate-400'}`}>1. VERIFICACIÓN <UserCheck size={16}/></button>
                {editingDoc.origen === 'Externo' && (
                  <>
                    <button onClick={() => setActiveTab(2)} className={`w-full text-left p-6 rounded-[30px] font-black text-xs transition-all flex items-center justify-between ${activeTab === 2 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-2xl' : 'text-slate-400'}`}>2. REQUERIMIENTO <Truck size={16}/></button>
                    <button onClick={() => setActiveTab(3)} className={`w-full text-left p-6 rounded-[30px] font-black text-xs transition-all flex items-center justify-between ${activeTab === 3 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-2xl' : 'text-slate-400'}`}>3. SEGUIMIENTO ({seguimientos.length}) <MessageSquare size={16}/></button>
                  </>
                )}
                <button onClick={() => setActiveTab(4)} className={`w-full text-left p-6 rounded-[30px] font-black text-xs transition-all flex items-center justify-between ${activeTab === 4 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-2xl' : 'text-slate-400'}`}>4. CIERRE <Save size={16}/></button>
              </div>
              <div className="flex-1 p-14 overflow-y-auto bg-white font-sans">
                {activeTab === 1 && (
                  <div className="grid grid-cols-2 gap-12 animate-in fade-in duration-300 font-sans font-sans">
                    <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Resp. Verificación (Col I)</label>
                      <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs uppercase cursor-pointer shadow-inner" value={editingDoc.responsable_verificacion || ''} onChange={e => setEditingDoc({...editingDoc, responsable_verificacion: e.target.value})}>
                        <option value="">SELECCIONE...</option>{LISTA_RESPONSABLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Verificación (Col J)</label><input type="date" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs shadow-inner" value={editingDoc.fecha_verificacion || ''} onChange={e => setEditingDoc({...editingDoc, fecha_verificacion: e.target.value})}/></div>
                    <div className="col-span-2 space-y-3 font-sans font-sans"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado Etapa (Col K)</label><select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs uppercase" value={editingDoc.estado_verificacion_k || ''} onChange={e => setEditingDoc({...editingDoc, estado_verificacion_k: e.target.value})}><option value="PENDIENTE">PENDIENTE</option><option value="VERIFICADO">VERIFICADO</option></select></div>
                    <div className="col-span-2 space-y-6 pt-6 text-center"><p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] font-sans">Estado de Visualización (Col L)</p>
                      <div className="grid grid-cols-2 gap-8"><button onClick={() => setEditingDoc({...editingDoc, estado_visualizacion: 'SI SE VISUALIZA'})} className={`p-10 rounded-[35px] border-2 font-black text-sm transition-all flex flex-col items-center gap-4 ${editingDoc.estado_visualizacion === 'SI SE VISUALIZA' ? 'border-green-600 bg-green-50 text-green-700 shadow-2xl shadow-green-900/10' : 'border-slate-50 bg-slate-50 text-slate-300'}`}><CheckCircle2 size={32}/> SÍ SE VISUALIZA</button>
                        <button onClick={() => setEditingDoc({...editingDoc, estado_visualizacion: 'NO SE VISUALIZA'})} className={`p-10 rounded-[35px] border-2 font-black text-sm transition-all flex flex-col items-center gap-4 ${editingDoc.estado_visualizacion === 'NO SE VISUALIZA' ? 'border-red-600 bg-red-50 text-red-700 shadow-2xl shadow-red-900/10' : 'border-slate-50 bg-slate-50 text-slate-300'}`}><AlertCircle size={32}/> NO SE VISUALIZA</button></div>
                    </div>
                    <div className="col-span-2 space-y-3 font-sans"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 font-sans">Observaciones (Col M)</label><textarea className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-medium text-xs shadow-inner" rows="3" value={editingDoc.observaciones || ''} onChange={e => setEditingDoc({...editingDoc, observaciones: e.target.value})}></textarea></div>
                  </div>
                )}
                {activeTab === 2 && (
                  <div className="grid grid-cols-2 gap-12 animate-in fade-in duration-300 font-sans font-sans">
                    <div className="space-y-3 font-sans"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Responsable Requerimiento (Col N)</label>
                      <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs uppercase cursor-pointer shadow-inner shadow-slate-200" value={editingDoc.responsable_requerimiento || ''} onChange={e => setEditingDoc({...editingDoc, responsable_requerimiento: e.target.value})}>
                        <option value="">SELECCIONE...</option>{LISTA_RESPONSABLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Elaboración (Col O)</label><input type="date" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs shadow-inner" value={editingDoc.fecha_elaboracion || ''} onChange={e => setEditingDoc({...editingDoc, fecha_elaboracion: e.target.value})}/></div>
                    <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">N° Documento Generado (Col P)</label><input type="text" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs shadow-inner" value={editingDoc.numero_documento || ''} onChange={e => setEditingDoc({...editingDoc, numero_documento: e.target.value})}/></div>
                    <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Notificación (Col Q)</label><input type="date" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs shadow-inner" value={editingDoc.fecha_notificacion || ''} onChange={e => setEditingDoc({...editingDoc, fecha_notificacion: e.target.value})}/></div>
                    <div className="col-span-2 bg-blue-50 p-10 rounded-[40px] border border-blue-100 flex items-center justify-between shadow-inner"><div><p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Días Hábiles Transcurridos (Cálculo Automático)</p><p className="text-6xl font-black text-blue-600 mt-2 tracking-tighter font-sans">{calcularDiasHabiles(editingDoc.fecha_notificacion)}</p></div><Clock size={80} className="text-blue-200 opacity-50"/></div>
                  </div>
                )}
                {activeTab === 3 && (
                  <div className="space-y-12 animate-in fade-in duration-300 font-sans">
                    <div className="bg-slate-50 p-10 rounded-[40px] space-y-6 border border-slate-200 font-sans"><h4 className="font-black text-xs uppercase text-slate-600 tracking-widest">Registrar Nuevo Seguimiento</h4><textarea id="s_obs" className="w-full p-6 rounded-[30px] border border-slate-100 bg-white text-sm outline-none shadow-inner font-medium shadow-slate-200 shadow-inner" rows="3" placeholder="Detalles del contacto con el remitente..."></textarea>
                      <button onClick={async () => {
                        const o = document.getElementById('s_obs').value; if(!o) return alert("Escriba un detalle.");
                        const { error } = await supabase.from('seguimientos').insert([{ documento_id: editingDoc.id, responsable: session.user, observaciones: o, fecha: new Date().toISOString() }]);
                        if(!error) { await supabase.from('documentos').update({ ultimo_seguimiento: new Date().toISOString() }).eq('id', editingDoc.id); document.getElementById('s_obs').value = ''; alert("Seguimiento Grabado"); fetchDocs(); }
                      }} className="bg-blue-600 text-white font-black py-5 px-12 rounded-3xl text-xs uppercase shadow-2xl shadow-blue-200 tracking-[0.2em] hover:scale-105 transition-all outline-none font-sans font-sans">Grabar Seguimiento</button>
                    </div>
                    {seguimientos.map(s => (<div key={s.id} className="p-8 border border-slate-100 rounded-[35px] flex items-start gap-6 bg-white shadow-sm hover:shadow-md transition-shadow font-sans"><div className="bg-blue-100 p-4 rounded-2xl text-blue-600 shrink-0 shadow-inner font-sans"><MessageSquare size={24}/></div><div className="flex-1 font-sans font-sans"><div className="flex justify-between items-center mb-2 font-sans font-sans"><p className="text-xs font-black text-slate-800 uppercase tracking-widest">{s.responsable}</p><span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full">{new Date(s.fecha).toLocaleDateString()}</span></div><p className="text-sm text-slate-500 font-medium italic">"{s.observaciones}"</p></div></div>))}
                  </div>
                )}
                {activeTab === 4 && (
                  <div className="grid grid-cols-2 gap-12 animate-in fade-in duration-300 font-sans font-sans font-sans">
                    <div className="col-span-2 bg-emerald-50 p-12 rounded-[45px] border border-emerald-100 flex items-center gap-8 shadow-inner"><input type="checkbox" className="w-12 h-12 accent-emerald-600 rounded-2xl shadow-sm cursor-pointer hover:scale-110 transition-transform shadow-lg" checked={editingDoc.cargado_sisged} onChange={e => setEditingDoc({...editingDoc, cargado_sisged: e.target.checked})}/><div><label className="font-black text-emerald-900 uppercase text-xs tracking-[0.2em] block mb-1">Cargado en SISGED (Col AB)</label><p className="text-[10px] text-emerald-700 font-bold opacity-60">Marque para finalizar documento como RECUPERADO.</p></div></div>
                    <div className="space-y-3 font-sans font-sans"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado Final (Col AC)</label><select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs uppercase cursor-pointer shadow-inner" value={editingDoc.estado_final || 'PENDIENTE'} onChange={e => setEditingDoc({...editingDoc, estado_final: e.target.value})}><option value="PENDIENTE">PENDIENTE</option><option value="RECUPERADO">RECUPERADO</option><option value="RECONSTRUCCION">RECONSTRUCCION</option></select></div>
                    <div className="space-y-3 font-sans font-sans font-sans"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 font-sans font-sans">Oficina de Destino (Col AA)</label><input type="text" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs shadow-inner" value={editingDoc.oficina_destino || ''} onChange={e => setEditingDoc({...editingDoc, oficina_destino: e.target.value})}/></div>
                    <div className="space-y-3 font-sans font-sans"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 font-sans font-sans">Resp. Devolución (Col X)</label>
                      <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs uppercase cursor-pointer shadow-inner shadow-slate-200" value={editingDoc.responsable_devolucion || ''} onChange={e => setEditingDoc({...editingDoc, responsable_devolucion: e.target.value})}>
                        <option value="">SELECCIONE...</option>{LISTA_RESPONSABLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2 space-y-3 font-sans font-sans font-sans"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 font-sans">Observaciones Finales (Col AD)</label><textarea className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-medium text-xs shadow-inner shadow-slate-200 shadow-inner" rows="3" value={editingDoc.observaciones_finales || ''} onChange={e => setEditingDoc({...editingDoc, observaciones_finales: e.target.value})}></textarea></div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-10 bg-slate-50 border-t flex justify-end gap-6 shrink-0 font-sans"><button onClick={() => setEditingDoc(null)} className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-10 hover:text-slate-700">Descartar</button>
            <button onClick={handleSyncChanges} className="bg-[#2563EB] text-white px-16 py-5 rounded-3xl font-black text-xs uppercase shadow-2xl tracking-[0.2em] hover:scale-[1.02] active:scale-95 transition-all outline-none font-sans font-sans font-sans">SINCRONIZAR CAMBIOS</button></div>
          </div>
        </div>
      )}

      {/* --- MODAL NUEVO EXPEDIENTE --- */}
      {isNewModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl flex items-center justify-center z-[110] p-6 animate-in zoom-in duration-300 font-sans">
          <div className="bg-white rounded-[50px] w-full max-w-xl shadow-2xl p-12 space-y-10 border border-white relative font-sans font-sans">
            <button onClick={() => setIsNewModalOpen(false)} className="absolute right-8 top-8 text-slate-300 hover:text-slate-600 transition-colors"><X/></button>
            <h3 className="text-2xl font-black uppercase text-center tracking-tighter text-slate-800 tracking-[0.1em]">Nuevo Expediente</h3>
            <div className="grid grid-cols-2 gap-6 font-sans">
              <input type="text" placeholder="CUT" className="w-full p-5 bg-slate-50 border-none rounded-3xl outline-none font-bold shadow-inner" id="n_cut" />
              <input type="text" placeholder="Documento" className="w-full p-5 bg-slate-50 border-none rounded-3xl outline-none font-bold shadow-inner" id="n_doc" />
              <input type="text" placeholder="Remitente / Entidad" className="w-full p-5 bg-slate-50 border-none rounded-3xl outline-none font-bold shadow-inner col-span-2 shadow-slate-200" id="n_rem" />
              <input type="date" className="w-full p-5 bg-slate-50 border-none rounded-3xl font-bold shadow-inner col-span-2 outline-none font-sans" id="n_fecha" />
              <div className="relative col-span-2 font-sans font-sans"><Phone size={16} className="absolute left-4 top-5 text-slate-300"/><input type="text" placeholder="Celular" className="w-full p-5 pl-12 bg-slate-50 border-none rounded-3xl outline-none font-bold shadow-inner" id="n_cel" /></div>
              <div className="relative col-span-2 font-sans"><Briefcase size={16} className="absolute left-4 top-5 text-slate-300"/><input type="text" placeholder="Procedimiento TUPA" className="w-full p-5 pl-12 bg-slate-50 border-none rounded-3xl outline-none font-bold shadow-inner" id="n_proc" /></div>
              <select className="w-full p-5 bg-slate-50 border-none rounded-3xl font-black text-[10px] uppercase shadow-inner cursor-pointer" id="n_sede"><option value="SC">SEDE CENTRAL (SC)</option><option value="OD">ÓRGANO DESCONCENTRADO (OD)</option></select>
              <select className="w-full p-5 bg-slate-50 border-none rounded-3xl font-black text-[10px] uppercase shadow-inner cursor-pointer" id="n_origen"><option value="Externo">Externo</option><option value="Interno">Interno</option></select>
            </div>
            <button onClick={async () => {
              const doc = { cut: document.getElementById('n_cut').value, documento: document.getElementById('n_doc').value, remitente: document.getElementById('n_rem').value, fecha_registro: document.getElementById('n_fecha').value, celular: document.getElementById('n_cel').value, procedimiento: document.getElementById('n_proc').value, sede: document.getElementById('n_sede').value, origen: document.getElementById('n_origen').value, etapa_actual: 'VERIFICACION', estado_final: 'PENDIENTE', creado_at: new Date().toISOString() };
              const { error } = await supabase.from('documentos').insert([doc]);
              if (!error) { setIsNewModalOpen(false); fetchDocs(); } else alert("Error (Verifique duplicados)");
            }} className="w-full bg-[#2563EB] text-white py-6 rounded-[30px] font-black uppercase shadow-2xl tracking-[0.3em] hover:bg-blue-700 transition-all outline-none">Registrar Documento</button>
          </div>
        </div>
      )}
    </div>
  );
}
