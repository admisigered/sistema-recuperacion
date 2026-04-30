'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabase';
import * as XLSX from 'xlsx';
import { 
  LayoutDashboard, FileText, Upload, Download, Search, 
  LogOut, ChevronLeft, ChevronRight, Save, Plus, Clock, 
  CheckCircle2, AlertCircle, Trash2, Bell, Filter, RefreshCcw, X
} from 'lucide-react';

const USUARIOS = [
  { user: 'Administrador', pass: 'admin123', email: 'admin@institucion.gob.pe' },
  { user: 'Yanina', pass: '123456', email: 'yanina@institucion.gob.pe' },
  { user: 'Cesar', pass: '123456', email: 'cesar@institucion.gob.pe' },
  { user: 'Xina', pass: '123456', email: 'xina@institucion.gob.pe' },
  { user: 'Fernando', pass: '123456', email: 'fernando@institucion.gob.pe' }
];

export default function SistemaSIGERED() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [page, setPage] = useState(1);
  const [view, setView] = useState('dashboard');
  const [editingDoc, setEditingDoc] = useState(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [loginData, setLoginData] = useState({ user: '', pass: '' });
  
  // FILTROS (Conectan Dashboard y Tabla)
  const [filters, setFilters] = useState({ 
    search: '', sede: '', etapa: '', estado: '', origen: '', responsable: '', fechaDesde: '', fechaHasta: '' 
  });

  const ITEMS_PER_PAGE = 100;

  // CARGAR DATOS CON FILTROS
  const fetchDocs = useCallback(async () => {
    setLoading(true);
    let from = (page - 1) * ITEMS_PER_PAGE;
    let to = from + ITEMS_PER_PAGE - 1;

    let query = supabase.from('documentos').select('*', { count: 'exact' });

    if (filters.search) query = query.or(`cut.ilike.%${filters.search}%,documento.ilike.%${filters.search}%,remitente.ilike.%${filters.search}%`);
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

  // FUNCIÓN IMPORTAR EXCEL
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

      const batch = data.slice(1).map(row => ({
        sede: row[0], cut: String(row[1] || ''), documento: String(row[2] || ''), remitente: row[3],
        fecha_registro: row[4], origen: row[5], procedimiento: row[6], celular: row[7],
        responsable_verificacion: row[8], fecha_verificacion: row[9],
        estado_visualizacion: row[11], observaciones: row[12],
        responsable_requerimiento: row[13], fecha_elaboracion: row[14],
        numero_documento: row[15], fecha_notificacion: row[16], medio_notificacion: row[17],
        fecha_remision: row[22], responsable_devolucion: row[23], fecha_devolucion: row[24],
        documento_cierre: row[25], oficina_destino: row[26],
        cargado_sisged: row[27] === 'SI', estado_final: row[28] || 'PENDIENTE', observaciones_finales: row[29],
        etapa_actual: row[28] === 'RECUPERADO' ? 'CIERRE' : 'VERIFICACION'
      })).filter(d => d.cut && d.documento);

      const { error } = await supabase.from('documentos').upsert(batch, { onConflict: 'cut,documento' });
      if (error) alert("Error: " + error.message);
      else { alert("Importación Exitosa"); fetchDocs(); }
    };
    reader.readAsBinaryString(file);
  };

  // FUNCIÓN LIMPIAR BASE
  const handleClearBase = async () => {
    if (session.user !== 'Administrador') return alert("Solo el administrador puede limpiar la base");
    if (confirm("¿ESTÁ SEGURO? Se borrarán todos los registros permanentemente.")) {
      const { error } = await supabase.from('documentos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (!error) { alert("Base de datos limpia"); fetchDocs(); }
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const valid = USUARIOS.find(u => u.user === loginData.user && u.pass === loginData.pass);
    if (valid) setSession(valid); else alert('Credenciales incorrectas');
  };

  const getStatusStyles = (doc) => {
    if (!doc.cargado_sisged && doc.etapa_actual !== 'VERIFICACION') return { label: 'EN PROCESO', bg: 'bg-orange-100 text-orange-700 border-orange-200' };
    switch (doc.estado_final) {
      case 'RECUPERADO': return { label: 'RECUPERADO', bg: 'bg-green-100 text-green-700 border-green-200' };
      case 'RECONSTRUCCION': return { label: 'RECONSTRUCCION', bg: 'bg-gray-100 text-gray-700 border-gray-200' };
      default: return { label: 'PENDIENTE', bg: 'bg-red-100 text-red-700 border-red-200' };
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-[#F0F4F8] flex items-center justify-center p-6" style={{backgroundImage: 'radial-gradient(#d1d5db 1px, transparent 1px)', backgroundSize: '20px 20px'}}>
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-white">
          <div className="bg-[#2563EB] p-10 text-center text-white relative">
            <h1 className="text-3xl font-extrabold tracking-tight">SIGERED</h1>
            <p className="text-blue-100 mt-2 font-medium uppercase text-xs tracking-widest">Sistema de Recuperación de Documentos</p>
          </div>
          <form onSubmit={handleLogin} className="p-10 space-y-6">
            <input type="text" placeholder="Usuario" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none" onChange={e => setLoginData({...loginData, user: e.target.value})} />
            <input type="password" placeholder="Contraseña" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none" onChange={e => setLoginData({...loginData, pass: e.target.value})} />
            <button className="w-full bg-[#2563EB] text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all">Iniciar Sesión</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex font-sans text-slate-900">
      {/* SIDEBAR */}
      <aside className="w-72 bg-[#1E293B] text-slate-300 flex flex-col fixed h-full shadow-2xl z-20">
        <div className="p-8">
            <span className="text-white font-black text-xl tracking-tighter">SIGERED <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-md ml-1">v2.4</span></span>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          <button onClick={() => setView('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all ${view === 'dashboard' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}>
            <LayoutDashboard size={18} /> Dashboard
          </button>
          <button onClick={() => setView('list')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all ${view === 'list' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}>
            <FileText size={18} /> Gestión de Registros
          </button>
        </nav>
        <div className="p-6 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold">{session.user[0]}</div>
            <div className="flex-1 overflow-hidden">
                <p className="text-xs font-bold text-white truncate">{session.user}</p>
                <p className="text-[10px] text-slate-500 uppercase">En Línea</p>
            </div>
            <button onClick={() => setSession(null)} className="text-slate-500 hover:text-white"><LogOut size={18} /></button>
          </div>
        </div>
      </aside>

      <main className="ml-72 flex-1 flex flex-col h-screen overflow-hidden">
        {/* HEADER CON FILTROS CONECTADOS */}
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex flex-wrap items-center gap-4 sticky top-0 z-10">
          <div className="flex gap-2 mr-auto">
              <button onClick={() => setIsNewModalOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-blue-700 transition-all"><Plus size={14}/> Nuevo Registro</button>
              <label className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-slate-50 cursor-pointer transition-all">
                <Upload size={14}/> Importar Excel
                <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleImport}/>
              </label>
              {session.user === 'Administrador' && (
                <button onClick={handleClearBase} className="bg-white border border-red-200 text-red-500 px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-red-50 transition-all"><RefreshCcw size={14}/> Limpiar Base</button>
              )}
          </div>
          
          <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border">
            <Search size={16} className="text-slate-400 ml-2" />
            <input type="text" placeholder="Buscar CUT..." className="bg-transparent border-none outline-none text-xs w-48" onChange={e => setFilters({...filters, search: e.target.value})} />
          </div>

          <div className="flex gap-2">
            <select className="border rounded-lg p-2 text-[10px] font-bold uppercase" onChange={e => setFilters({...filters, sede: e.target.value})}>
                <option value="">Sedes</option>
                <option value="Sede Central">Sede Central</option>
                <option value="Sede Norte">Sede Norte</option>
                <option value="OD">Sede OD</option>
            </select>
            <select className="border rounded-lg p-2 text-[10px] font-bold uppercase" onChange={e => setFilters({...filters, responsable: e.target.value})}>
                <option value="">Responsables</option>
                {USUARIOS.map(u => <option key={u.user} value={u.user}>{u.user}</option>)}
            </select>
            <input type="date" className="border rounded-lg p-2 text-[10px]" onChange={e => setFilters({...filters, fechaDesde: e.target.value})} title="Fecha Desde" />
          </div>
        </header>

        <div className="p-10 overflow-y-auto flex-1">
          {view === 'dashboard' ? (
            <div className="space-y-10">
              {/* DASHBOARD REAL */}
              <div className="grid grid-cols-4 gap-8">
                <div className="bg-white p-8 rounded-3xl border shadow-sm flex items-center justify-between">
                  <div><p className="text-[10px] font-black text-slate-400 uppercase mb-1">Total Sistema</p><h3 className="text-4xl font-black">{totalDocs}</h3></div>
                  <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center"><FileText size={24}/></div>
                </div>
                <div className="bg-white p-8 rounded-3xl border shadow-sm flex items-center justify-between">
                  <div><p className="text-[10px] font-black text-slate-400 uppercase mb-1">Pendientes</p><h3 className="text-4xl font-black text-red-600">{docs.filter(d => d.estado_final === 'PENDIENTE').length}</h3></div>
                  <div className="w-14 h-14 bg-red-100 text-red-500 rounded-2xl flex items-center justify-center"><AlertCircle size={24}/></div>
                </div>
                <div className="bg-white p-8 rounded-3xl border shadow-sm flex items-center justify-between">
                  <div><p className="text-[10px] font-black text-slate-400 uppercase mb-1">En Proceso</p><h3 className="text-4xl font-black text-orange-500">{docs.filter(d => !d.cargado_sisged && d.etapa_actual !== 'VERIFICACION').length}</h3></div>
                  <div className="w-14 h-14 bg-orange-100 text-orange-500 rounded-2xl flex items-center justify-center"><Clock size={24}/></div>
                </div>
                <div className="bg-white p-8 rounded-3xl border shadow-sm flex items-center justify-between">
                  <div><p className="text-[10px] font-black text-slate-400 uppercase mb-1">Recuperados</p><h3 className="text-4xl font-black text-emerald-600">{docs.filter(d => d.estado_final === 'RECUPERADO').length}</h3></div>
                  <div className="w-14 h-14 bg-emerald-100 text-emerald-500 rounded-2xl flex items-center justify-center"><CheckCircle2 size={24}/></div>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-8">
                {/* BARRAS DE PROGRESO DINÁMICAS */}
                <div className="col-span-8 bg-white p-10 rounded-[40px] border shadow-sm">
                   <h4 className="text-xl font-bold mb-8">Avance por Etapa (Filtrado)</h4>
                   <div className="space-y-10">
                      {[
                        {name: 'Verificación', key: 'VERIFICACION', color: 'bg-orange-500'},
                        {name: 'Cierre / Recuperación', key: 'CIERRE', color: 'bg-emerald-500'}
                      ].map(item => {
                        const count = docs.filter(d => d.etapa_actual === item.key).length;
                        const pct = totalDocs > 0 ? (count / totalDocs * 100).toFixed(1) : 0;
                        return (
                          <div key={item.key} className="space-y-3">
                            <div className="flex justify-between text-sm font-bold">
                              <span>{item.name}</span>
                              <span>{count} docs ({pct}%)</span>
                            </div>
                            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full ${item.color} transition-all duration-1000`} style={{width: `${pct}%`}}></div>
                            </div>
                          </div>
                        )
                      })}
                   </div>
                </div>
                
                {/* ALERTAS: AVANCE DE USUARIOS */}
                <div className="col-span-4 space-y-6">
                   <h4 className="text-xl font-bold ml-2">Avance de Usuarios</h4>
                   {USUARIOS.map(u => {
                      const atendidos = docs.filter(d => d.responsable_verificacion === u.user && d.estado_final === 'RECUPERADO').length;
                      const totalU = docs.filter(d => d.responsable_verificacion === u.user).length;
                      return (
                        <div key={u.user} className="bg-white border p-4 rounded-2xl shadow-sm flex items-center gap-4">
                           <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center font-bold text-xs">{u.user[0]}</div>
                           <div className="flex-1">
                              <p className="text-xs font-black">{u.user}</p>
                              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                                <span>Atendidos: {atendidos}</span>
                                <span>Total: {totalU}</span>
                              </div>
                           </div>
                        </div>
                      )
                   })}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[40px] shadow-sm border overflow-hidden">
               <div className="p-8 border-b flex justify-between items-center">
                  <div className="flex gap-4">
                    <select className="border rounded-xl px-4 py-2 text-[10px] font-black uppercase" onChange={e => setFilters({...filters, origen: e.target.value})}>
                        <option value="">Origen</option>
                        <option value="Interno">Interno</option>
                        <option value="Externo">Externo</option>
                    </select>
                    <select className="border rounded-xl px-4 py-2 text-[10px] font-black uppercase" onChange={e => setFilters({...filters, estado: e.target.value})}>
                        <option value="">Estado Final</option>
                        <option value="PENDIENTE">PENDIENTE</option>
                        <option value="RECUPERADO">RECUPERADO</option>
                        <option value="RECONSTRUCCION">RECONSTRUCCION</option>
                    </select>
                  </div>
               </div>

               <table className="w-full text-left">
                <thead className="bg-slate-50/50">
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                    <th className="p-6 pl-10">CUT</th>
                    <th className="p-6">Documento</th>
                    <th className="p-6 text-center">Sede</th>
                    <th className="p-6 text-center">Etapa / Estado</th>
                    <th className="p-6 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {docs.map(doc => {
                    const status = getStatusStyles(doc);
                    return (
                      <tr key={doc.id} className="hover:bg-slate-50 transition-all text-sm">
                        <td className="p-6 pl-10 font-black">{doc.cut}</td>
                        <td className="p-6 text-xs text-slate-500">{doc.documento}</td>
                        <td className="p-6 text-center font-bold">{doc.sede}</td>
                        <td className="p-6">
                           <div className="flex flex-col items-center gap-1">
                              <span className="text-[9px] font-black bg-slate-100 px-2 py-0.5 rounded uppercase">{doc.etapa_actual}</span>
                              <span className={`text-[10px] font-black px-4 py-1.5 rounded-xl border uppercase ${status.bg}`}>{status.label}</span>
                           </div>
                        </td>
                        <td className="p-6 text-center">
                             <button onClick={() => setEditingDoc(doc)} className="bg-white border text-blue-600 px-4 py-2 rounded-xl font-black text-[10px] hover:bg-blue-50 transition-all">DETALLES</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              <div className="p-10 bg-slate-50/50 flex justify-between items-center">
                <p className="text-xs font-bold text-slate-400">Total: {totalDocs} registros</p>
                <div className="flex gap-4">
                  <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="w-10 h-10 rounded-xl bg-white border flex items-center justify-center hover:bg-blue-600 hover:text-white disabled:opacity-30"><ChevronLeft size={18}/></button>
                  <button onClick={() => setPage(p => p + 1)} disabled={page * 100 >= totalDocs} className="w-10 h-10 rounded-xl bg-white border flex items-center justify-center hover:bg-blue-600 hover:text-white disabled:opacity-30"><ChevronRight size={18}/></button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* MODAL NUEVO REGISTRO */}
      {isNewModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[100] p-10">
          <div className="bg-white rounded-[40px] w-full max-w-2xl overflow-hidden shadow-2xl border">
            <div className="p-8 bg-[#1E293B] text-white flex justify-between items-center">
              <h3 className="text-xl font-black">Nuevo Registro Documental</h3>
              <button onClick={() => setIsNewModalOpen(false)}><X/></button>
            </div>
            <div className="p-10 grid grid-cols-2 gap-6">
              <input type="text" placeholder="CUT" className="p-4 bg-slate-50 border rounded-2xl" id="new_cut" />
              <input type="text" placeholder="Número de Documento" className="p-4 bg-slate-50 border rounded-2xl" id="new_doc" />
              <input type="text" placeholder="Remitente" className="p-4 bg-slate-50 border rounded-2xl col-span-2" id="new_remitente" />
              <select className="p-4 bg-slate-50 border rounded-2xl" id="new_sede">
                <option value="Sede Central">Sede Central</option>
                <option value="Sede Norte">Sede Norte</option>
                <option value="OD">Sede OD</option>
              </select>
              <select className="p-4 bg-slate-50 border rounded-2xl" id="new_origen">
                <option value="Externo">Externo</option>
                <option value="Interno">Interno</option>
              </select>
            </div>
            <div className="p-8 bg-slate-50 flex justify-end gap-4">
              <button onClick={async () => {
                const docData = {
                  cut: document.getElementById('new_cut').value,
                  documento: document.getElementById('new_doc').value,
                  remitente: document.getElementById('new_remitente').value,
                  sede: document.getElementById('new_sede').value,
                  origen: document.getElementById('new_origen').value,
                  estado_final: 'PENDIENTE',
                  etapa_actual: 'VERIFICACION',
                  fecha_registro: new Date().toISOString().split('T')[0]
                };
                const { error } = await supabase.from('documentos').insert([docData]);
                if (error) alert("Error: CUT+Documento ya existe o datos inválidos");
                else { alert("Registrado"); setIsNewModalOpen(false); fetchDocs(); }
              }} className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-black">GUARDAR REGISTRO</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALLES / EDICIÓN */}
      {editingDoc && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-10 z-[100]">
           <div className="bg-white rounded-[40px] w-full max-w-5xl h-[80vh] overflow-hidden shadow-2xl flex flex-col">
              <div className="p-8 bg-[#1E293B] text-white flex justify-between items-center">
                 <h3 className="text-xl font-black">Actualización: {editingDoc.cut}</h3>
                 <button onClick={() => setEditingDoc(null)}>✕</button>
              </div>
              <div className="flex-1 p-10 overflow-y-auto grid grid-cols-2 gap-8">
                 <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase">Responsable Verificación</label>
                    <select className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" value={editingDoc.responsable_verificacion || ''} onChange={e => setEditingDoc({...editingDoc, responsable_verificacion: e.target.value})}>
                      <option value="">Seleccione...</option>
                      {USUARIOS.map(u => <option key={u.user} value={u.user}>{u.user}</option>)}
                    </select>
                 </div>
                 <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase">Estado de Visualización</label>
                    <select className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" value={editingDoc.estado_visualizacion || ''} onChange={e => setEditingDoc({...editingDoc, estado_visualizacion: e.target.value})}>
                      <option value="">Seleccione...</option>
                      <option value="SI SE VISUALIZA">SI SE VISUALIZA</option>
                      <option value="NO SE VISUALIZA">NO SE VISUALIZA</option>
                    </select>
                 </div>
                 <div className="col-span-2 bg-blue-50 p-6 rounded-3xl border border-blue-100 space-y-4">
                    <div className="flex items-center gap-4">
                       <input type="checkbox" className="w-6 h-6 rounded accent-blue-600" checked={editingDoc.cargado_sisged} onChange={e => setEditingDoc({...editingDoc, cargado_sisged: e.target.checked})} />
                       <label className="font-bold text-slate-700">¿Cargado en SISGED? (Marca para cierre)</label>
                    </div>
                    <select className="w-full p-4 bg-white border rounded-2xl font-bold" value={editingDoc.estado_final} onChange={e => setEditingDoc({...editingDoc, estado_final: e.target.value, etapa_actual: e.target.value === 'RECUPERADO' ? 'CIERRE' : 'VERIFICACION'})}>
                        <option value="PENDIENTE">PENDIENTE</option>
                        <option value="RECUPERADO">RECUPERADO (FINALIZAR)</option>
                        <option value="RECONSTRUCCION">RECONSTRUCCION</option>
                    </select>
                 </div>
              </div>
              <div className="p-8 bg-slate-50 flex justify-end gap-4">
                 <button onClick={async () => {
                    const { error } = await supabase.from('documentos').update(editingDoc).eq('id', editingDoc.id);
                    if (!error) { alert('Actualizado'); setEditingDoc(null); fetchDocs(); }
                 }} className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-black">GUARDAR CAMBIOS</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
