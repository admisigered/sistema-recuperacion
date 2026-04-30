'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabase';
import * as XLSX from 'xlsx';
import { 
  LayoutDashboard, FileText, Upload, Download, Search, 
  LogOut, ChevronLeft, ChevronRight, Save, Plus, Clock, 
  CheckCircle2, AlertCircle, Trash2, Filter, RefreshCcw, X, CheckSquare, Square
} from 'lucide-react';

const USUARIOS = [
  { user: 'Administrador', pass: 'admin123' },
  { user: 'Yanina', pass: '123456' },
  { user: 'Cesar', pass: '123456' },
  { user: 'Xina', pass: '123456' },
  { user: 'Fernando', pass: '123456' }
];

export default function SistemaSIGERED() {
  // 1. ESTADOS
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [page, setPage] = useState(1);
  const [view, setView] = useState('dashboard');
  const [editingDoc, setEditingDoc] = useState(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [loginData, setLoginData] = useState({ user: '', pass: '' });
  const [selectedIds, setSelectedIds] = useState([]);

  // FILTROS GLOBALES
  const [filters, setFilters] = useState({ 
    search: '', sede: '', etapa: '', estado: '', origen: '', responsable: '', fechaDesde: '', fechaHasta: '' 
  });

  const ITEMS_PER_PAGE = 100;

  // 2. FUNCIÓN DE LOGIN (Corregida arriba para evitar el error de Vercel)
  const handleLogin = (e) => {
    e.preventDefault();
    const valid = USUARIOS.find(u => u.user === loginData.user && u.pass === loginData.pass);
    if (valid) {
      setSession(valid);
    } else {
      alert('Credenciales incorrectas. Verifique usuario y contraseña.');
    }
  };

  // 3. CARGA DE DATOS
  const fetchDocs = useCallback(async () => {
    setLoading(true);
    let from = (page - 1) * ITEMS_PER_PAGE;
    let to = from + ITEMS_PER_PAGE - 1;

    let query = supabase.from('documentos').select('*', { count: 'exact' });

    if (filters.search) query = query.or(`cut.ilike.%${filters.search}%,documento.ilike.%${filters.search}%`);
    if (filters.sede) query = query.eq('sede', filters.sede);
    if (filters.etapa) query = query.eq('etapa_actual', filters.etapa);
    if (filters.estado) query = query.eq('estado_final', filters.estado);
    if (filters.origen) query = query.eq('origen', filters.origen);
    if (filters.responsable) query = query.eq('responsable_verificacion', filters.responsable);
    if (filters.fechaDesde) query = query.gte('fecha_registro', filters.fechaDesde);
    if (filters.fechaHasta) query = query.lte('fecha_registro', filters.fechaHasta);

    const { data, count, error } = await query.order('creado_at', { ascending: false }).range(from, to);
    
    if (!error) { 
      setDocs(data); 
      setTotalDocs(count); 
    }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // 4. FUNCIONES DE SELECCIÓN Y ACCIONES MASIVAS
  const toggleSelectAll = () => {
    if (selectedIds.length === docs.length) setSelectedIds([]);
    else setSelectedIds(docs.map(d => d.id));
  };

  const toggleSelectDoc = (id) => {
    if (selectedIds.includes(id)) setSelectedIds(selectedIds.filter(i => i !== id));
    else setSelectedIds([...selectedIds, id]);
  };

  const handleBulkDelete = async () => {
    if (session.user !== 'Administrador') return alert("Solo el administrador puede eliminar.");
    if (confirm(`¿Eliminar ${selectedIds.length} registros seleccionados?`)) {
      const { error } = await supabase.from('documentos').delete().in('id', selectedIds);
      if (!error) { setSelectedIds([]); fetchDocs(); }
    }
  };

  const handleBulkAssign = async (name) => {
    if (!name) return;
    const { error } = await supabase.from('documentos').update({ responsable_verificacion: name }).in('id', selectedIds);
    if (!error) { alert("Documentos asignados correctamente"); setSelectedIds([]); fetchDocs(); }
  };

  // 5. REPORTES Y EXCEL
  const handleExport = (all = false) => {
    const ws = XLSX.utils.json_to_sheet(docs);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SIGERED");
    XLSX.writeFile(wb, `Reporte_${all ? 'General' : 'Filtrado'}.xlsx`);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const data = XLSX.utils.sheet_to_json(XLSX.read(evt.target.result, { type: 'binary' }).Sheets[XLSX.read(evt.target.result, { type: 'binary' }).SheetNames[0]], { header: 1 });
      const batch = data.slice(1).map(row => ({
        sede: row[0], cut: String(row[1] || ''), documento: String(row[2] || ''), remitente: row[3],
        fecha_registro: row[4], origen: row[5], responsable_verificacion: row[8],
        estado_final: row[28] || 'PENDIENTE', etapa_actual: row[28] === 'RECUPERADO' ? 'CIERRE' : 'VERIFICACION'
      })).filter(d => d.cut);
      await supabase.from('documentos').upsert(batch, { onConflict: 'cut,documento' });
      fetchDocs();
    };
    reader.readAsBinaryString(file);
  };

  const getStatusStyles = (doc) => {
    if (!doc.cargado_sisged && doc.etapa_actual !== 'VERIFICACION') return { label: 'EN PROCESO', bg: 'bg-orange-100 text-orange-700 border-orange-200' };
    switch (doc.estado_final) {
      case 'RECUPERADO': return { label: 'RECUPERADO', bg: 'bg-green-100 text-green-700 border-green-200' };
      case 'RECONSTRUCCION': return { label: 'RECONSTRUCCION', bg: 'bg-gray-100 text-gray-700 border-gray-200' };
      default: return { label: 'PENDIENTE', bg: 'bg-red-100 text-red-700 border-red-200' };
    }
  };

  // VISTA LOGIN
  if (!session) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden">
          <div className="bg-blue-600 p-12 text-center text-white">
            <h1 className="text-4xl font-black tracking-tighter">SIGERED</h1>
            <p className="text-[10px] uppercase mt-2 tracking-[0.2em] opacity-70">Sistema de Recuperación</p>
          </div>
          <form onSubmit={handleLogin} className="p-10 space-y-5">
            <input type="text" placeholder="Usuario" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none focus:ring-2 focus:ring-blue-500" onChange={e => setLoginData({...loginData, user: e.target.value})} required />
            <input type="password" placeholder="Contraseña" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none focus:ring-2 focus:ring-blue-500" onChange={e => setLoginData({...loginData, pass: e.target.value})} required />
            <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">INICIAR SESIÓN</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex text-slate-900 font-sans">
      {/* SIDEBAR */}
      <aside className="w-64 bg-[#1E293B] text-slate-400 flex flex-col fixed h-full z-20">
        <div className="p-8 font-black text-white text-2xl tracking-tighter border-b border-slate-800">SIGERED</div>
        <nav className="flex-1 p-4 space-y-2 mt-4">
          <button onClick={() => setView('dashboard')} className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl transition-all ${view === 'dashboard' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'hover:bg-slate-800'}`}><LayoutDashboard size={18}/> Dashboard</button>
          <button onClick={() => setView('list')} className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl transition-all ${view === 'list' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'hover:bg-slate-800'}`}><FileText size={18}/> Gestión</button>
          <button onClick={() => setView('reports')} className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl transition-all ${view === 'reports' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'hover:bg-slate-800'}`}><Download size={18}/> Reportes</button>
        </nav>
        <div className="p-6 border-t border-slate-800 flex items-center gap-3 bg-slate-900/50">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-white text-sm">{session.user[0]}</div>
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-bold text-white truncate">{session.user}</p>
            <p className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">En Línea</p>
          </div>
          <button onClick={() => setSession(null)} className="hover:text-white transition-colors"><LogOut size={18}/></button>
        </div>
      </aside>

      <main className="ml-64 flex-1 flex flex-col h-screen overflow-hidden">
        {/* CABECERA DE FILTROS GLOBALES */}
        <header className="bg-white border-b p-4 flex flex-wrap items-center gap-4 sticky top-0 z-10 shadow-sm px-8">
          <div className="flex gap-2 mr-auto">
            <button onClick={() => setIsNewModalOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-sm"><Plus size={14}/> Nuevo</button>
            <label className="bg-white border px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer hover:bg-slate-50"><Upload size={14}/> Importar <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleImport}/></label>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400"/>
              <input type="text" placeholder="CUT / Doc..." className="pl-9 pr-3 py-2 bg-slate-50 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 w-40 transition-all" onChange={e => setFilters({...filters, search: e.target.value})}/>
            </div>
            
            <select className="border rounded-xl p-2 text-[10px] font-black uppercase bg-white cursor-pointer" onChange={e => setFilters({...filters, sede: e.target.value})}>
                <option value="">Sedes (Todas)</option>
                <option value="SC">SC (Central)</option>
                <option value="OD">OD (Órgano Desconcentrado)</option>
            </select>

            <select className="border rounded-xl p-2 text-[10px] font-black uppercase bg-white cursor-pointer" onChange={e => setFilters({...filters, estado: e.target.value})}>
                <option value="">Estado (Todos)</option>
                <option value="PENDIENTE">PENDIENTE</option>
                <option value="RECUPERADO">RECUPERADO</option>
                <option value="RECONSTRUCCION">RECONSTRUCCION</option>
            </select>

            <select className="border rounded-xl p-2 text-[10px] font-black uppercase bg-white cursor-pointer" onChange={e => setFilters({...filters, etapa: e.target.value})}>
                <option value="">Etapa (Todas)</option>
                <option value="VERIFICACION">1. Verificación</option>
                <option value="CIERRE">4. Cierre</option>
            </select>

            <select className="border rounded-xl p-2 text-[10px] font-black uppercase bg-white cursor-pointer" onChange={e => setFilters({...filters, origen: e.target.value})}>
                <option value="">Origen (Todos)</option>
                <option value="Interno">Interno</option>
                <option value="Externo">Externo</option>
            </select>
          </div>
        </header>

        <div className="p-10 overflow-y-auto flex-1">
          {view === 'dashboard' ? (
            <div className="space-y-10 animate-in fade-in duration-500">
              {/* TARJETAS KPI */}
              <div className="grid grid-cols-4 gap-8">
                <div className="bg-white p-8 rounded-[32px] border shadow-sm border-b-4 border-b-blue-500">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Registros</p>
                  <h3 className="text-4xl font-black">{totalDocs}</h3>
                </div>
                <div className="bg-white p-8 rounded-[32px] border shadow-sm border-b-4 border-b-red-500">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pendientes</p>
                  <h3 className="text-4xl font-black text-red-600">{docs.filter(d => d.estado_final === 'PENDIENTE').length}</h3>
                </div>
                <div className="bg-white p-8 rounded-[32px] border shadow-sm border-b-4 border-b-orange-500">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">En Seguimiento</p>
                  <h3 className="text-4xl font-black text-orange-500">{docs.filter(d => !d.cargado_sisged && d.etapa_actual !== 'VERIFICACION').length}</h3>
                </div>
                <div className="bg-white p-8 rounded-[32px] border shadow-sm border-b-4 border-b-green-500">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Recuperados</p>
                  <h3 className="text-4xl font-black text-green-600">{docs.filter(d => d.e
