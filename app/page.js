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
                  <h3 className="text-4xl font-black text-green-600">{docs.filter(d => d.estado_final === 'RECUPERADO').length}</h3>
                </div>
              </div>
              
              {/* AVANCE DE USUARIOS */}
              <div className="bg-white p-10 rounded-[40px] border shadow-sm">
                <h4 className="font-bold text-slate-500 mb-8 uppercase text-xs tracking-widest">Resumen de Avance por Usuario (Filtrado)</h4>
                <div className="grid grid-cols-3 gap-6">
                  {USUARIOS.map(u => {
                    const asig = docs.filter(d => d.responsable_verificacion === u.user).length;
                    const recu = docs.filter(d => d.responsable_verificacion === u.user && d.estado_final === 'RECUPERADO').length;
                    const pct = asig > 0 ? Math.round((recu / asig) * 100) : 0;
                    return (
                      <div key={u.user} className="p-6 border rounded-3xl bg-slate-50/50 flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                          <span className="font-black text-sm text-slate-700">{u.user}</span>
                          <span className="text-[10px] font-bold bg-blue-100 text-blue-600 px-2 py-1 rounded-lg">{pct}% Eficacia</span>
                        </div>
                        <div className="flex justify-between text-xs font-bold text-slate-500 mt-2">
                          <span>Asignados: {asig}</span>
                          <span className="text-green-600">Recuperados: {recu}</span>
                        </div>
                        <div className="h-2 w-full bg-slate-200 rounded-full mt-2 overflow-hidden">
                          <div className="h-full bg-blue-600 rounded-full transition-all duration-700" style={{width: `${pct}%`}}></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : view === 'list' ? (
            <div className="space-y-6 animate-in fade-in duration-500">
              {/* BARRA DE ACCIONES MASIVAS */}
              {selectedIds.length > 0 && (
                <div className="bg-blue-600 p-4 rounded-2xl flex items-center justify-between shadow-lg shadow-blue-200 text-white">
                  <div className="flex items-center gap-4 ml-4">
                    <CheckSquare size={20}/>
                    <span className="font-bold text-sm">{selectedIds.length} Documentos seleccionados</span>
                  </div>
                  <div className="flex gap-3">
                    <select className="text-xs p-2.5 border-none rounded-xl bg-white text-slate-900 font-bold outline-none" onChange={(e) => handleBulkAssign(e.target.value)}>
                      <option value="">Asignar Responsable...</option>
                      {USUARIOS.map(u => <option key={u.user} value={u.user}>{u.user}</option>)}
                    </select>
                    {session.user === 'Administrador' && (
                      <button onClick={handleBulkDelete} className="bg-red-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-red-600 transition-all"><Trash2 size={16}/> Eliminar Masivo</button>
                    )}
                    <button onClick={() => setSelectedIds([])} className="bg-white/20 px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-white/30">Cancelar</button>
                  </div>
                </div>
              )}

              {/* TABLA DE REGISTROS */}
              <div className="bg-white rounded-[32px] shadow-sm border overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/80 border-b text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <tr>
                      <th className="p-5 pl-8 w-12 text-center border-r">
                        <button onClick={toggleSelectAll} className="hover:scale-110 transition-transform">
                          {selectedIds.length === docs.length && docs.length > 0 ? <CheckSquare size={20} className="text-blue-600"/> : <Square size={20}/>}
                        </button>
                      </th>
                      <th className="p-5">CUT</th>
                      <th className="p-5">Documento</th>
                      <th className="p-5 text-center">Sede</th>
                      <th className="p-5 text-center">Origen</th>
                      <th className="p-5 text-center">Etapa / Estado</th>
                      <th className="p-5 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {docs.map(doc => {
                      const status = getStatusStyles(doc);
                      const isSelected = selectedIds.includes(doc.id);
                      return (
                        <tr key={doc.id} className={`hover:bg-slate-50/80 transition-all ${isSelected ? 'bg-blue-50/50' : ''}`}>
                          <td className="p-5 pl-8 text-center border-r">
                            <button onClick={() => toggleSelectDoc(doc.id)} className="hover:scale-110 transition-transform">
                              {isSelected ? <CheckSquare size={20} className="text-blue-600"/> : <Square size={20} className="text-slate-200"/>}
                            </button>
                          </td>
                          <td className="p-5 font-black text-slate-700">{doc.cut}</td>
                          <td className="p-5 text-xs font-bold text-slate-400 truncate max-w-[250px]">{doc.documento}</td>
                          <td className="p-5 text-center font-black text-[10px] text-slate-600">{doc.sede || 'SC'}</td>
                          <td className="p-5 text-center text-[10px] font-black uppercase text-slate-400">{doc.origen || 'Externo'}</td>
                          <td className="p-5">
                             <div className="flex flex-col items-center gap-1">
                                <span className="text-[9px] font-black bg-slate-200 text-slate-500 px-2 py-0.5 rounded-md uppercase tracking-tighter">{doc.etapa_actual}</span>
                                <span className={`text-[10px] font-black px-4 py-1.5 rounded-xl border shadow-sm uppercase ${status.bg}`}>{status.label}</span>
                             </div>
                          </td>
                          <td className="p-5 text-center">
                            <button onClick={() => setEditingDoc(doc)} className="bg-white border-2 border-blue-50 text-blue-600 font-black text-[10px] px-4 py-2 rounded-xl hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all shadow-sm uppercase tracking-widest">Detalles</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {/* PAGINACIÓN */}
                <div className="p-8 bg-slate-50/50 flex justify-between items-center border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total: <span className="text-slate-900">{totalDocs}</span> registros</p>
                  <div className="flex gap-4">
                    <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="w-11 h-11 rounded-2xl bg-white border border-slate-200 flex items-center justify-center hover:bg-blue-600 hover:text-white shadow-sm disabled:opacity-20 transition-all"><ChevronLeft size={20}/></button>
                    <button onClick={() => setPage(p => p + 1)} disabled={page * 100 >= totalDocs} className="w-11 h-11 rounded-2xl bg-white border border-slate-200 flex items-center justify-center hover:bg-blue-600 hover:text-white shadow-sm disabled:opacity-20 transition-all"><ChevronRight size={20}/></button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* MÓDULO DE REPORTES */
            <div className="max-w-3xl mx-auto py-10 animate-in zoom-in-95 duration-300">
              <div className="bg-white p-16 rounded-[48px] border shadow-xl text-center space-y-8 border-white">
                <div className="bg-blue-50 w-24 h-24 rounded-[32px] flex items-center justify-center mx-auto text-blue-600 shadow-inner"><Download size={40}/></div>
                <div className="space-y-2">
                  <h2 className="text-3xl font-black tracking-tight text-slate-800">Exportación de Datos</h2>
                  <p className="text-slate-500 text-sm max-w-md mx-auto">Seleccione el tipo de reporte que desea descargar en formato Microsoft Excel.</p>
                </div>
                <div className="grid grid-cols-2 gap-6 pt-6">
                  <button onClick={() => handleExport(false)} className="bg-white border-2 border-slate-100 p-8 rounded-[32px] font-black text-sm hover:border-blue-600 hover:text-blue-600 transition-all flex flex-col items-center gap-4 group">
                    <div className="bg-slate-50 p-4 rounded-2xl group-hover:bg-blue-50 transition-colors"><Filter size={24}/></div>
                    Reporte Filtrado
                  </button>
                  <button onClick={() => handleExport(true)} className="bg-blue-600 text-white p-8 rounded-[32px] font-black text-sm hover:bg-blue-700 transition-all flex flex-col items-center gap-4 shadow-2xl shadow-blue-200">
                    <div className="bg-white/20 p-4 rounded-2xl"><RefreshCcw size={24}/></div>
                    Reporte General
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* MODAL NUEVO REGISTRO */}
      {isNewModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] w-full max-w-xl overflow-hidden shadow-2xl border border-white">
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-widest text-sm">Nuevo Registro Documental</h3>
              <button onClick={() => setIsNewModalOpen(false)} className="hover:rotate-90 transition-transform"><X/></button>
            </div>
            <div className="p-10 space-y-6 bg-white">
              <div className="grid grid-cols-2 gap-6">
                <input type="text" placeholder="CUT" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none font-bold text-sm focus:ring-2 focus:ring-blue-500" id="m_cut" required />
                <input type="text" placeholder="N° Documento" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none font-bold text-sm focus:ring-2 focus:ring-blue-500" id="m_doc" required />
              </div>
              <input type="text" placeholder="Remitente / Entidad" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none font-bold text-sm focus:ring-2 focus:ring-blue-500" id="m_rem" />
              <div className="grid grid-cols-2 gap-6">
                <select className="w-full p-4 bg-slate-50 border rounded-2xl font-black text-[10px] uppercase cursor-pointer" id="m_sede">
                  <option value="SC">SEDE CENTRAL (SC)</option>
                  <option value="OD">ÓRGANO DESCONCENTRADO (OD)</option>
                </select>
                <select className="w-full p-4 bg-slate-50 border rounded-2xl font-black text-[10px] uppercase cursor-pointer" id="m_ori">
                  <option value="Externo">Externo</option>
                  <option value="Interno">Interno</option>
                </select>
              </div>
              <button onClick={async () => {
                const c = document.getElementById('m_cut').value;
                const d = document.getElementById('m_doc').value;
                if(!c || !d) return alert("CUT y Documento son obligatorios");
                const doc = { 
                  cut: c, documento: d, remitente: document.getElementById('m_rem').value,
                  sede: document.getElementById('m_sede').value, origen: document.getElementById('m_ori').value,
                  etapa_actual: 'VERIFICACION', estado_final: 'PENDIENTE',
                  fecha_registro: new Date().toISOString().split('T')[0]
                };
                const { error } = await supabase.from('documentos').insert([doc]);
                if (!error) { setIsNewModalOpen(false); fetchDocs(); } else alert("Error: Combinación CUT+Documento ya existe.");
              }} className="w-full bg-blue-600 text-white py-5 rounded-[24px] font-black text-sm tracking-[0.2em] shadow-xl shadow-blue-200 mt-4 hover:scale-[1.02] active:scale-95 transition-all">REGISTRAR EN EL SISTEMA</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALLES / EDICIÓN */}
      {editingDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-[48px] w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-white">
            <div className="p-10 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-2xl font-black tracking-tight">Actualización de Registro</h3>
                <p className="text-[10px] text-blue-400 uppercase font-black tracking-[0.2em] mt-1">{editingDoc.cut} • {editingDoc.documento}</p>
              </div>
              <button onClick={() => setEditingDoc(null)} className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all">✕</button>
            </div>
            <div className="flex-1 p-12 overflow-y-auto bg-white grid grid-cols-2 gap-10">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Responsable de Etapa</label>
                <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl font-black text-xs uppercase" value={editingDoc.responsable_verificacion || ''} onChange={e => setEditingDoc({...editingDoc, responsable_verificacion: e.target.value})}>
                  <option value="">Sin Asignar</option>
                  {USUARIOS.map(u => <option key={u.user} value={u.user}>{u.user}</option>)}
                </select>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado del Documento</label>
                <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl font-black text-xs uppercase" value={editingDoc.estado_final} onChange={e => setEditingDoc({...editingDoc, estado_final: e.target.value, etapa_actual: e.target.value === 'RECUPERADO' ? 'CIERRE' : 'VERIFICACION'})}>
                  <option value="PENDIENTE">PENDIENTE</option>
                  <option value="RECUPERADO">RECUPERADO (FINALIZAR)</option>
                  <option value="RECONSTRUCCION">RECONSTRUCCION</option>
                </select>
              </div>
              <div className="col-span-2 bg-blue-50/50 p-8 rounded-[40px] border border-blue-100/50 space-y-6">
                <div className="flex items-center gap-4 bg-white p-6 rounded-3xl border border-blue-100">
                   <input type="checkbox" className="w-7 h-7 rounded-lg accent-blue-600 cursor-pointer shadow-sm" checked={editingDoc.cargado_sisged} onChange={e => setEditingDoc({...editingDoc, cargado_sisged: e.target.checked})} />
                   <label className="font-black text-xs text-blue-900 uppercase tracking-widest">¿Cargado correctamente en el sistema SISGED?</label>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1">Observaciones Finales</label>
                  <textarea className="w-full p-6 bg-white border border-blue-100 rounded-[32px] outline-none text-sm font-medium" rows="3" placeholder="Escriba aquí los detalles..." value={editingDoc.observaciones || ''} onChange={e => setEditingDoc({...editingDoc, observaciones: e.target.value})}></textarea>
                </div>
              </div>
            </div>
            <div className="p-10 bg-slate-50 border-t border-slate-100 flex justify-end gap-6 shrink-0">
              <button onClick={() => setEditingDoc(null)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-all">Descartar</button>
              <button onClick={async () => {
                const { error } = await supabase.from('documentos').update(editingDoc).eq('id', editingDoc.id);
                if (!error) { setEditingDoc(null); fetchDocs(); }
              }} className="bg-blue-600 text-white px-12 py-5 rounded-[24px] font-black text-xs tracking-widest shadow-2xl shadow-blue-200 hover:scale-[1.03] active:scale-95 transition-all uppercase">Actualizar Datos</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
