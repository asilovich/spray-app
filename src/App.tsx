import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Map as MapIcon, 
  Package, 
  ClipboardList, 
  Plus, 
  DollarSign, 
  CheckCircle2, 
  Clock,
  TrendingUp,
  ChevronRight,
  LogOut,
  Wallet,
  Receipt,
  UserPlus,
  ShieldCheck,
  HardHat,
  Trash2,
  Archive,
  X,
  Search,
  Printer,
  Edit,
  Menu,
  FileDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateFinancialYearPDF } from './utils/pdfGenerator';

type User = {
  id: number;
  username: string;
  role: 'admin' | 'operator';
  operator_number?: number;
  commission_rate?: number;
};

type Client = { 
  id: number; 
  name: string; 
  type: 'individual' | 'company';
  responsible?: string;
  address?: string;
  city?: string;
  cuit?: string;
  phone: string; 
  email: string;
  default_price: number;
};
type Field = { id: number; client_id: number; name: string; area: number; client_name: string };
type Product = { id: number; name: string; unit: string; cost_per_unit: number };
type Job = { 
  id: number; 
  field_id: number; 
  date: string; 
  product_id: number | null; 
  product_amount: number | null; 
  price_per_hectare: number; 
  total_amount: number; 
  status: 'pending' | 'completed' | 'paid'; 
  notes: string;
  field_name: string;
  area: number;
  client_name: string;
  product_name: string | null;
  operator_id: number;
  operator_name: string;
  operator_number: number;
  invoicing_status: 'pending' | 'invoiced' | 'no_invoice';
  vat_rate: number;
  paid: number;
};

type Stats = {
  total_jobs: number;
  total_revenue: number;
  pending_revenue: number;
  collected_revenue: number;
  total_hectares: number;
  total_machine_hectares: number;
};

type FinanceSummary = {
  clientSummary: {
    client_name: string;
    field_name: string;
    total_lot_area: number;
    total_machine_area: number;
    invoiced_area: number;
    pending_area: number;
    no_invoice_area: number;
    total_revenue: number;
    total_vat: number;
  }[];
  operatorSummary: {
    operator_id: number;
    operator_name: string;
    operator_number: number;
    total_area: number;
    commission_amount: number;
    jobs: {
      date: string;
      client_name: string;
      field_name: string;
      machine_hectares: number;
      commission_amount: number;
    }[];
  }[];
  totalRevenue: number;
  totalExpenses: number;
  balance: number;
};

type Expense = {
  id: number;
  description: string;
  amount: number;
  date: string;
  category: string;
};

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isRegistering, setIsRegistering] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = useState<1 | 2>(1);
  const [forgotPasswordUsername, setForgotPasswordUsername] = useState('');
  const [secretQuestion, setSecretQuestion] = useState('');
  const [forgotPasswordError, setForgotPasswordError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [userCreateError, setUserCreateError] = useState('');
  const [activeTab, setActiveTab] = useState<'panel' | 'clients' | 'spraying' | 'finances' | 'users' | 'financial_years'>('panel');
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [finances, setFinances] = useState<FinanceSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [financialYears, setFinancialYears] = useState<any[]>([]);
  const [financialYearSearch, setFinancialYearSearch] = useState('');
  const [selectedFinancialYear, setSelectedFinancialYear] = useState<any | null>(null);
  const [selectedFinancialYearData, setSelectedFinancialYearData] = useState<{jobs: any[], expenses: any[]} | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQuickFieldModal, setShowQuickFieldModal] = useState(false);
  const [showCloseYearModal, setShowCloseYearModal] = useState(false);
  const [showDeleteYearModal, setShowDeleteYearModal] = useState(false);
  const [deleteYearPassword, setDeleteYearPassword] = useState('');
  const [deleteYearError, setDeleteYearError] = useState('');
  const [jobToDelete, setJobToDelete] = useState<number | null>(null);
  const [clientToDelete, setClientToDelete] = useState<number | null>(null);
  const [selectedClientForJob, setSelectedClientForJob] = useState<number | null>(null);
  const [currentJobPrice, setCurrentJobPrice] = useState<number>(0);

  // New Client Form State
  const [clientType, setClientType] = useState<'individual' | 'company'>('individual');
  const [newClientFields, setNewClientFields] = useState<{ name: string, area: number }[]>([]);
  const [closeYearForm, setCloseYearForm] = useState({ name: '', end_date: new Date().toISOString().split('T')[0] });
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingField, setEditingField] = useState<Field | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const fetchData = async () => {
    if (!token) return;
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [cRes, fRes, jRes, sRes] = await Promise.all([
        fetch('/api/clients', { headers }),
        fetch('/api/fields', { headers }),
        fetch('/api/jobs', { headers }),
        fetch('/api/stats', { headers })
      ]);
      setClients(await cRes.json());
      setFields(await fRes.json());
      setJobs(await jRes.json());
      setStats(await sRes.json());

      if (user?.role === 'admin') {
        const [finRes, expRes, usrRes, fyRes] = await Promise.all([
          fetch('/api/finances', { headers }),
          fetch('/api/expenses', { headers }),
          fetch('/api/users', { headers }),
          fetch('/api/financial-years', { headers })
        ]);
        setFinances(await finRes.json());
        setExpenses(await expRes.json());
        setAllUsers(await usrRes.json());
        setFinancialYears(await fyRes.json());
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchData();
    else setLoading(false);
  }, [token]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginError('');
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const { token, user } = await res.json();
      setToken(token);
      setUser(user);
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      setLoginError("Credenciales inválidas. Por favor, intenta de nuevo.");
    }
  };

  const handleForgotPasswordStep1 = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setForgotPasswordError('');
    const formData = new FormData(e.currentTarget);
    const username = formData.get('username') as string;
    const res = await fetch(`/api/auth/secret-question?username=${encodeURIComponent(username)}`);
    if (res.ok) {
      const data = await res.json();
      setSecretQuestion(data.secret_question);
      setForgotPasswordUsername(username);
      setForgotPasswordStep(2);
    } else {
      const err = await res.json();
      setForgotPasswordError(err.error || "Usuario no encontrado o no tiene pregunta secreta configurada.");
    }
  };

  const handleForgotPasswordStep2 = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setForgotPasswordError('');
    const formData = new FormData(e.currentTarget);
    const secret_answer = formData.get('secret_answer') as string;
    const new_password = formData.get('new_password') as string;
    
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: forgotPasswordUsername, secret_answer, new_password }),
    });

    if (res.ok) {
      alert("Contraseña restablecida con éxito. Ahora puedes iniciar sesión.");
      setIsForgotPassword(false);
      setForgotPasswordStep(1);
    } else {
      const err = await res.json();
      setForgotPasswordError(err.error || "Respuesta incorrecta.");
    }
  };

  const handlePublicRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setRegisterError('');
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        operator_number: data.operator_number ? Number(data.operator_number) : null
      }),
    });
    if (res.ok) {
      alert("Registro exitoso. Ahora puedes iniciar sesión.");
      setIsRegistering(false);
    } else {
      const err = await res.json();
      setRegisterError(err.error || "Error al registrarse.");
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUserCreateError('');
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        ...data,
        operator_number: data.operator_number ? Number(data.operator_number) : null
      }),
    });
    if (res.ok) {
      fetchData();
      (e.target as HTMLFormElement).reset();
    } else {
      const err = await res.json();
      setUserCreateError(err.error || "Error al crear el usuario.");
    }
  };

  const handleAddExpense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    await fetch('/api/expenses', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        ...data,
        amount: Number(data.amount)
      }),
    });
    fetchData();
    (e.target as HTMLFormElement).reset();
  };

  const handleAddClient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        ...data,
        type: clientType,
        default_price: Number(data.default_price || 0),
        fields: newClientFields
      }),
    });
    
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Error al crear cliente");
      return;
    }
    
    fetchData();
    setNewClientFields([]);
    (e.target as HTMLFormElement).reset();
  };

  const handleAddField = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    await fetch('/api/fields', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        ...data,
        client_id: Number(data.client_id),
        area: Number(data.area)
      }),
    });
    fetchData();
    (e.target as HTMLFormElement).reset();
  };

  const handleAddProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    await fetch('/api/products', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        ...data,
        cost_per_unit: Number(data.cost_per_unit)
      }),
    });
    fetchData();
    (e.target as HTMLFormElement).reset();
  };

  const deleteClient = async (id: number) => {
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Error al eliminar cliente");
        return;
      }
      fetchData();
      setClientToDelete(null);
    } catch (error) {
      console.error("Error deleting client:", error);
      alert("Error al eliminar cliente");
    }
  };

  const fetchFinancialYearData = async (yearId: number) => {
    if (!token) return;
    const headers = { 'Authorization': `Bearer ${token}` };
    try {
      const [jobsRes, expensesRes] = await Promise.all([
        fetch(`/api/financial-years/${yearId}/jobs`, { headers }),
        fetch(`/api/financial-years/${yearId}/expenses`, { headers })
      ]);
      setSelectedFinancialYearData({
        jobs: await jobsRes.json(),
        expenses: await expensesRes.json()
      });
    } catch (error) {
      console.error("Error fetching financial year data:", error);
    }
  };

  const handleCloseYear = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Auto-generate name if empty
    const yearName = closeYearForm.name.trim() || `Ejercicio cerrado el ${new Date().toLocaleDateString()}`;
    
    const res = await fetch('/api/financial-years', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ ...closeYearForm, name: yearName })
    });
    
    if (res.ok) {
      setShowCloseYearModal(false);
      setCloseYearForm({ name: '', end_date: new Date().toISOString().split('T')[0] });
      fetchData();
    } else {
      const err = await res.json();
      console.error(err.error);
    }
  };

  const handleDeleteYear = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDeleteYearError('');
    
    if (!selectedFinancialYear) return;

    const res = await fetch(`/api/financial-years/${selectedFinancialYear.id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ password: deleteYearPassword })
    });
    
    if (res.ok) {
      setShowDeleteYearModal(false);
      setDeleteYearPassword('');
      setSelectedFinancialYear(null);
      setSelectedFinancialYearData(null);
      fetchData();
    } else {
      const err = await res.json();
      setDeleteYearError(err.error || 'Error al eliminar el ejercicio');
    }
  };

  const handleAddJob = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    
    const machineHectares = Number(data.machine_hectares);
    const pricePerHectare = currentJobPrice;
    const totalAmount = machineHectares * pricePerHectare;

    await fetch('/api/jobs', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...data,
        field_id: Number(data.field_id),
        product_id: data.product_id ? Number(data.product_id) : null,
        product_amount: data.product_amount ? Number(data.product_amount) : null,
        price_per_hectare: pricePerHectare,
        total_amount: totalAmount,
        status: 'pending',
        operator_id: Number(data.operator_id),
        machine_hectares: machineHectares
      }),
    });
    fetchData();
    (e.target as HTMLFormElement).reset();
    setCurrentJobPrice(0);
  };

  const updateJobStatus = async (id: number, status: string) => {
    await fetch(`/api/jobs/${id}`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status }),
    });
    fetchData();
  };

  const deleteJob = async (id: number) => {
    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchData();
        setJobToDelete(null);
      } else {
        const err = await res.json();
        alert(`Error al eliminar: ${err.error}`);
      }
    } catch (error) {
      console.error("Error deleting job:", error);
      alert("Error de red al intentar eliminar el trabajo.");
    }
  };

  if (!token) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-3xl shadow-xl border border-stone-200 w-full max-w-md"
      >
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4">
            <TrendingUp className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-stone-900">Control Spray</h1>
          <p className="text-stone-500 text-sm">
            {isForgotPassword ? "Recupera tu contraseña" : isRegistering ? "Crea una cuenta nueva" : "Ingresa a tu cuenta para continuar"}
          </p>
        </div>

        <div className="flex border-b border-stone-200 mb-6">
          <button 
            className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-colors ${!isForgotPassword && !isRegistering ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-stone-400 hover:text-stone-600'}`}
            onClick={() => { setIsForgotPassword(false); setIsRegistering(false); setLoginError(''); }}
          >
            Ingresar
          </button>
          <button 
            className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-colors ${isRegistering ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-stone-400 hover:text-stone-600'}`}
            onClick={() => { setIsRegistering(true); setIsForgotPassword(false); }}
          >
            Registrarse
          </button>
          <button 
            className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-colors ${isForgotPassword ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-stone-400 hover:text-stone-600'}`}
            onClick={() => { setIsForgotPassword(true); setIsRegistering(false); setForgotPasswordError(''); setForgotPasswordStep(1); }}
          >
            Recuperar
          </button>
        </div>
        
        {isForgotPassword ? (
          forgotPasswordStep === 1 ? (
            <form onSubmit={handleForgotPasswordStep1} className="space-y-4">
              {forgotPasswordError && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                  {forgotPasswordError}
                </div>
              )}
              <Input name="username" label="Usuario" placeholder="Nombre de usuario" required />
              <button 
                type="submit" 
                className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 mt-4"
              >
                Continuar
              </button>
            </form>
          ) : (
            <form onSubmit={handleForgotPasswordStep2} className="space-y-4">
              {forgotPasswordError && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                  {forgotPasswordError}
                </div>
              )}
              <div className="p-4 bg-stone-50 rounded-xl border border-stone-200">
                <p className="text-sm font-bold text-stone-700 mb-1">Pregunta Secreta:</p>
                <p className="text-stone-600 italic">{secretQuestion}</p>
              </div>
              <Input name="secret_answer" label="Respuesta Secreta" placeholder="Tu respuesta" required />
              <Input name="new_password" label="Nueva Contraseña" type="password" placeholder="••••••••" required />
              <button 
                type="submit" 
                className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 mt-4"
              >
                Restablecer Contraseña
              </button>
              <button 
                type="button"
                onClick={() => { setForgotPasswordStep(1); setForgotPasswordError(''); }}
                className="w-full text-stone-500 text-sm hover:underline"
              >
                Volver
              </button>
            </form>
          )
        ) : isRegistering ? (
          <form onSubmit={handlePublicRegister} className="space-y-4">
            {registerError && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                {registerError}
              </div>
            )}
            <Input name="username" label="Usuario" placeholder="Nombre de usuario" required />
            <Input name="password" label="Contraseña" type="password" placeholder="••••••••" required />
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-500 uppercase">Rol</label>
              <select name="role" className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" required>
                <option value="operator">Operario</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <Input name="operator_number" label="Nº de Ingreso (Solo Operarios)" type="number" placeholder="Ej: 1" />
            <Input name="secret_question" label="Pregunta Secreta (Para recuperar contraseña)" placeholder="Ej: ¿Nombre de mi primera mascota?" required />
            <Input name="secret_answer" label="Respuesta Secreta" placeholder="Tu respuesta secreta" required />
            <button 
              type="submit" 
              className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 mt-4"
            >
              Registrarse
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                {loginError}
              </div>
            )}
            <Input name="username" label="Usuario" placeholder="Tu nombre de usuario" required />
            <Input name="password" label="Contraseña" type="password" placeholder="••••••••" required />
            <button 
              type="submit" 
              className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 mt-4"
            >
              Iniciar Sesión
            </button>
          </form>
        )}
      </motion.div>
      <div className="absolute bottom-4 text-stone-400 text-xs font-medium">
        v{import.meta.env.VITE_APP_VERSION || '0.0.1'}
      </div>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-stone-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
    </div>
  );

  const handleExportData = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-stone-200 p-4 flex justify-between items-center sticky top-0 z-30">
        <h1 className="text-xl font-bold text-emerald-700 flex items-center gap-2">
          <TrendingUp className="w-6 h-6" />
          Control Spray
        </h1>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-stone-600 hover:bg-stone-100 rounded-lg">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-50
        w-64 bg-white border-r border-stone-200 flex flex-col print:hidden
        transform transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-6 hidden md:block">
          <h1 className="text-xl font-bold text-emerald-700 flex items-center gap-2">
            <TrendingUp className="w-6 h-6" />
            Control Spray
          </h1>
          <p className="text-xs text-stone-500 mt-1 uppercase tracking-wider font-semibold">Pulverizaciones</p>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4 md:mt-0 overflow-y-auto">
          <NavItem active={activeTab === 'panel'} onClick={() => { setActiveTab('panel'); setIsMobileMenuOpen(false); }} icon={<LayoutDashboard size={20} />} label="Panel de Control" />
          {user?.role === 'admin' && (
            <>
              <NavItem active={activeTab === 'clients'} onClick={() => { setActiveTab('clients'); setSelectedClientId(null); setIsMobileMenuOpen(false); }} icon={<Users size={20} />} label="Clientes" />
              <NavItem active={activeTab === 'spraying'} onClick={() => { setActiveTab('spraying'); setIsMobileMenuOpen(false); }} icon={<ClipboardList size={20} />} label="Pulverización" />
              <NavItem active={activeTab === 'finances'} onClick={() => { setActiveTab('finances'); setIsMobileMenuOpen(false); }} icon={<Wallet size={20} />} label="Finanzas" />
              <NavItem active={activeTab === 'financial_years'} onClick={() => { setActiveTab('financial_years'); setIsMobileMenuOpen(false); }} icon={<Archive size={20} />} label="Ejercicios" />
              <NavItem active={activeTab === 'users'} onClick={() => { setActiveTab('users'); setIsMobileMenuOpen(false); }} icon={<ShieldCheck size={20} />} label="Usuarios" />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-stone-100 space-y-2">
          <div className="bg-emerald-50 rounded-xl p-4">
            <p className="text-xs font-bold text-emerald-800 uppercase tracking-tighter mb-1">Hectáreas Realizadas</p>
            <p className="text-lg font-bold text-emerald-900">{(stats?.total_machine_hectares ?? 0).toLocaleString()} ha</p>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-50 transition-all"
          >
            <LogOut size={20} />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 print:p-0 print:overflow-visible w-full">
        <header className="mb-6 md:mb-8 flex flex-col md:flex-row md:justify-between md:items-center gap-4 print:hidden">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight capitalize">
              {activeTab === 'panel' ? 'Panel de Control' : 
               activeTab === 'spraying' ? 'Pulverización' : 
               activeTab}
            </h2>
            <p className="text-sm md:text-base text-stone-500">Gestiona tus operaciones agrícolas con precisión.</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={handleExportData}
              className="w-full md:w-auto bg-white border border-stone-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-50 transition-colors flex items-center justify-center gap-2"
            >
              <Printer size={16} />
              Imprimir / Exportar PDF
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'panel' && (
            <motion.div 
              key="panel"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Quick Access Section */}
                <div className="bg-emerald-900 text-white rounded-3xl p-8 shadow-xl flex flex-col justify-center">
                  <h3 className="font-bold text-xl mb-6 flex items-center gap-2">
                    <TrendingUp className="w-6 h-6" />
                    Acceso Rápido
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <QuickActionBtn onClick={() => setActiveTab('spraying')} label="Nueva Pulverización" icon={<Plus size={20} />} />
                    <QuickActionBtn onClick={() => setActiveTab('clients')} label="Nuevo Cliente" icon={<Users size={20} />} />
                    <button 
                      onClick={() => setShowQuickFieldModal(true)}
                      className="sm:col-span-2 flex items-center justify-center gap-3 p-5 bg-white/10 hover:bg-white/20 rounded-2xl transition-all text-center font-bold uppercase text-sm tracking-widest border border-white/5"
                    >
                      <MapIcon size={20} /> Nuevo Lote / Campo
                    </button>
                  </div>
                </div>

                {/* Total Lot Hectares Section */}
                <div className="bg-white rounded-3xl border border-stone-200 p-8 shadow-sm flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mb-6">
                    <MapIcon className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h3 className="text-stone-500 font-bold uppercase tracking-widest text-sm mb-2">Hectáreas Realizadas</h3>
                  <p className="text-6xl font-black text-stone-900 tracking-tighter">
                    {stats?.total_machine_hectares?.toLocaleString() ?? 0}
                  </p>
                  <p className="text-stone-400 font-medium mt-2">Superficie total trabajada</p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'clients' && (
            <motion.div key="clients" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
              {!selectedClientId ? (
                <>
                  <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
                    <h3 className="font-bold text-lg mb-6">Registrar Nuevo Cliente</h3>
                    <form onSubmit={handleAddClient} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-stone-500 uppercase">Tipo de Cliente</label>
                            <select 
                              value={clientType} 
                              onChange={(e) => setClientType(e.target.value as 'individual' | 'company')}
                              className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                              <option value="individual">Persona Física (Nombre)</option>
                              <option value="company">Empresa / Responsable</option>
                            </select>
                          </div>
                          <Input name="name" label={clientType === 'individual' ? "Nombre Completo" : "Razón Social / Empresa"} placeholder={clientType === 'individual' ? "Ej: Juan Pérez" : "Ej: Agropecuaria S.A."} required />
                          <Input name="phone" label="Teléfono" placeholder="Ej: +54 9 11..." />
                          <Input name="responsible" label="Responsable / Contacto" placeholder="Ej: Ing. Agr. Carlos Gómez" />
                          <Input name="cuit" label="CUIT" placeholder="Ej: 30-12345678-9" />
                          <Input name="address" label="Dirección" placeholder="Ej: Av. Rural 123" />
                          <Input name="city" label="Ciudad" placeholder="Ej: Pergamino" />
                          <Input name="email" label="Email" type="email" placeholder="juan@ejemplo.com" />
                          {user?.role === 'admin' && (
                            <Input name="default_price" label="Precio Pulverización ($/ha)" type="number" step="0.01" placeholder="Ej: 4500" />
                          )}
                        </div>

                        <div className="border-t border-stone-100 pt-6">
                          <div className="flex justify-between items-center mb-4">
                            <h4 className="font-bold text-stone-700">Lotes / Campos Asociados</h4>
                            <p className="text-xs text-stone-500">Carga los lotes iniciales para este cliente</p>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end bg-stone-50 p-4 rounded-xl border border-stone-100">
                            <Input id="new-lote-name" label="Nombre/Número del Lote" placeholder="Ej: Lote 14 o 'La Loma'" />
                            <Input id="new-lote-area" label="Hectáreas" type="number" step="0.01" placeholder="Ej: 45.5" />
                            <button 
                              type="button"
                              onClick={() => {
                                const nameInput = document.getElementById('new-lote-name') as HTMLInputElement;
                                const areaInput = document.getElementById('new-lote-area') as HTMLInputElement;
                                if (nameInput.value && areaInput.value) {
                                  setNewClientFields([...newClientFields, { name: nameInput.value, area: Number(areaInput.value) }]);
                                  nameInput.value = '';
                                  areaInput.value = '';
                                }
                              }}
                              className="bg-stone-200 text-stone-700 px-4 py-2 rounded-lg font-bold hover:bg-stone-300 transition-colors flex items-center justify-center gap-2"
                            >
                              <Plus size={18} /> Agregar Lote
                            </button>
                          </div>

                          {newClientFields.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {newClientFields.map((field, idx) => (
                                <div key={idx} className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 border border-emerald-100">
                                  {field.name} ({field.area} ha)
                                  <button type="button" onClick={() => setNewClientFields(newClientFields.filter((_, i) => i !== idx))} className="hover:text-emerald-900">×</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end pt-4">
                        <button type="submit" className="bg-emerald-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 flex items-center gap-2">
                          <Plus size={20} /> Registrar Cliente Completo
                        </button>
                      </div>
                    </form>
                  </div>

                  {user?.role === 'admin' && (
                    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
                      <table className="w-full text-left">
                        <thead className="bg-stone-50 border-b border-stone-200">
                          <tr>
                            <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Cliente / Empresa</th>
                            <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Facturación</th>
                            <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Tipo</th>
                            <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Contacto</th>
                            <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Precio $/ha</th>
                            <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {clients.map(client => (
                            <tr key={client.id} className="hover:bg-stone-50 transition-colors">
                              <td className="px-6 py-4">
                                <p className="font-bold">{client.name}</p>
                                {client.responsible && <p className="text-xs text-stone-500">Resp: {client.responsible}</p>}
                              </td>
                              <td className="px-6 py-4">
                                {client.cuit && <p className="text-sm font-mono text-stone-600">CUIT: {client.cuit}</p>}
                                {(client.address || client.city) && (
                                  <p className="text-xs text-stone-500">
                                    {client.address}{client.address && client.city ? ', ' : ''}{client.city}
                                  </p>
                                )}
                                {!client.cuit && !client.address && !client.city && <span className="text-stone-300 italic text-xs">Sin datos</span>}
                              </td>
                              <td className="px-6 py-4">
                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${client.type === 'company' ? 'bg-blue-100 text-blue-700' : 'bg-stone-100 text-stone-700'}`}>
                                  {client.type === 'company' ? 'Empresa' : 'Individual'}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <p className="text-sm text-stone-600">{client.phone}</p>
                                <p className="text-xs text-stone-400">{client.email}</p>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-stone-500">$</span>
                                  {user?.role === 'admin' ? (
                                    <input 
                                      type="number" 
                                      defaultValue={client.default_price}
                                      onBlur={async (e) => {
                                        const newPrice = Number(e.target.value);
                                        if (newPrice !== client.default_price) {
                                          const res = await fetch(`/api/clients/${client.id}`, {
                                            method: 'PATCH',
                                            headers: { 
                                              'Content-Type': 'application/json',
                                              'Authorization': `Bearer ${token}`
                                            },
                                            body: JSON.stringify({ default_price: newPrice })
                                          });
                                          if (!res.ok) {
                                            const err = await res.json();
                                            alert(err.error || "Error al actualizar precio");
                                            e.target.value = String(client.default_price);
                                            return;
                                          }
                                          fetchData();
                                        }
                                      }}
                                      className="w-24 bg-stone-50 border border-stone-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    />
                                  ) : (
                                    <span className="text-sm font-medium text-stone-700">
                                      ***
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right flex items-center justify-end gap-4">
                                <button 
                                  onClick={() => setEditingClient(client)}
                                  className="text-stone-400 hover:text-emerald-600 transition-colors"
                                  title="Editar Cliente"
                                >
                                  <Edit size={16} />
                                </button>
                                <button 
                                  onClick={() => setClientToDelete(client.id)}
                                  className="text-stone-400 hover:text-red-600 transition-colors"
                                  title="Eliminar Cliente"
                                >
                                  <Trash2 size={16} />
                                </button>
                                <button 
                                  onClick={() => setSelectedClientId(client.id)}
                                  className="text-emerald-600 font-bold text-sm hover:underline flex items-center gap-1"
                                >
                                  Ver Campos <ChevronRight size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setSelectedClientId(null)}
                      className="p-2 hover:bg-stone-200 rounded-lg transition-colors"
                    >
                      <ChevronRight className="rotate-180" size={20} />
                    </button>
                    <div>
                      <h3 className="text-xl font-bold">{clients.find(c => c.id === selectedClientId)?.name}</h3>
                      <p className="text-sm text-stone-500">Gestión de campos para este cliente</p>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
                    <h3 className="font-bold text-lg mb-6">Registrar Nuevo Campo</h3>
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget);
                        const data = Object.fromEntries(formData.entries());
                        fetch('/api/fields', {
                          method: 'POST',
                          headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                          },
                          body: JSON.stringify({
                            ...data,
                            client_id: selectedClientId,
                            area: Number(data.area)
                          }),
                        }).then(() => {
                          fetchData();
                          (e.target as HTMLFormElement).reset();
                        });
                      }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input name="name" label="Nombre del Campo" placeholder="Ej: La Estancia" required />
                        <Input name="area" label="Superficie (Hectáreas)" type="number" step="0.01" placeholder="Ej: 150.5" required />
                      <div className="md:col-span-2 flex justify-end">
                        <button type="submit" className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2">
                          <Plus size={18} /> Guardar Campo
                        </button>
                      </div>
                    </form>
                  </div>

                  <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                      <thead className="bg-stone-50 border-b border-stone-200">
                        <tr>
                          <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Campo</th>
                          <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Área (ha)</th>
                          <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {fields.filter(f => f.client_id === selectedClientId).map(field => (
                          <tr key={field.id} className="hover:bg-stone-50 transition-colors">
                            <td className="px-6 py-4 font-bold">{field.name}</td>
                            <td className="px-6 py-4 text-stone-600 font-mono">{field.area} ha</td>
                            <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => setEditingField(field)}
                                className="text-stone-400 hover:text-emerald-600 transition-colors"
                              >
                                <Edit size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {fields.filter(f => f.client_id === selectedClientId).length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-6 py-8 text-center text-stone-500 italic">No hay campos registrados para este cliente.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'spraying' && (
            <motion.div key="spraying" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
              <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
                <h3 className="font-bold text-lg mb-6">Registrar Nueva Pulverización</h3>
                <form onSubmit={(e) => {
                  handleAddJob(e);
                  setSelectedClientForJob(null);
                }} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-500 uppercase">Cliente / Empresa</label>
                    <select 
                      onChange={(e) => {
                        const cid = Number(e.target.value);
                        setSelectedClientForJob(cid);
                        const client = clients.find(c => c.id === cid);
                        if (client) {
                          setCurrentJobPrice(client.default_price || 0);
                        }
                      }}
                      className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    >
                      <option value="">Seleccionar Cliente</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-500 uppercase">Campo / Lote</label>
                    <select 
                      name="field_id" 
                      className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50" 
                      required
                      disabled={!selectedClientForJob}
                    >
                      <option value="">{selectedClientForJob ? "Seleccionar Campo" : "Primero elija un cliente"}</option>
                      {fields.filter(f => f.client_id === selectedClientForJob).map(f => (
                        <option key={f.id} value={f.id}>{f.name} ({f.area} ha)</option>
                      ))}
                    </select>
                  </div>
                  <Input name="date" label="Fecha" type="date" required defaultValue={new Date().toISOString().split('T')[0]} />
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-500 uppercase">Operador</label>
                    {user?.role === 'admin' ? (
                      <select 
                        name="operator_id" 
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" 
                        required
                      >
                        <option value="">Seleccionar Operador</option>
                        {allUsers.filter(u => u.role === 'operator').map(u => (
                          <option key={u.id} value={u.id}>#{u.operator_number} - {u.username}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="w-full bg-stone-100 border border-stone-200 rounded-lg px-4 py-2 text-stone-600 font-medium">
                        #{user?.operator_number} - {user?.username}
                        <input type="hidden" name="operator_id" value={user?.id} />
                      </div>
                    )}
                  </div>
                  <Input name="machine_hectares" label="Hectáreas Realizadas" type="number" step="0.01" placeholder="Ej: 148.5" required />
                  <div className="md:col-span-1">
                    <Input name="notes" label="Notas / Observaciones" placeholder="Ej: Mucho viento..." />
                  </div>
                  <div className="md:col-span-3 flex justify-end">
                    <button type="submit" className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2">
                      <Plus size={18} /> Registrar Pulverización
                    </button>
                  </div>
                </form>
              </div>

              {user?.role === 'admin' && (
                <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead className="bg-stone-50 border-b border-stone-200">
                      <tr>
                        <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Fecha</th>
                        <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Cliente / Campo</th>
                        <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Operador</th>
                        <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Ha. Lote</th>
                        <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Ha. Realizadas</th>
                        <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Notas</th>
                        <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Estado</th>
                        <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {jobs.map(job => (
                        <tr key={job.id} className="hover:bg-stone-50 transition-colors">
                          <td className="px-6 py-4 text-stone-600">{new Date(job.date).toLocaleDateString()}</td>
                          <td className="px-6 py-4">
                            <p className="font-bold">{job.field_name}</p>
                            <p className="text-xs text-stone-500">{job.client_name}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-medium">#{job.operator_number}</p>
                            <p className="text-xs text-stone-400">{job.operator_name}</p>
                          </td>
                          <td className="px-6 py-4 font-bold text-stone-600">{job.area} ha</td>
                          <td className="px-6 py-4 font-bold text-emerald-700">{job.machine_hectares} ha</td>
                          <td className="px-6 py-4">
                            <p className="text-xs text-stone-500 max-w-[150px] truncate" title={job.notes}>{job.notes || '-'}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                              job.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {job.status === 'completed' ? 'Completado' : 'Pendiente'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-4">
                              {job.status === 'pending' && (
                                <button onClick={() => updateJobStatus(job.id, 'completed')} className="text-xs font-bold text-emerald-600 hover:underline">Marcar Completado</button>
                              )}
                              {job.status === 'completed' && (
                                <button onClick={() => updateJobStatus(job.id, 'pending')} className="text-xs font-bold text-amber-600 hover:underline">Revertir a Pendiente</button>
                              )}
                              <button onClick={() => setJobToDelete(job.id)} className="text-xs font-bold text-red-500 hover:underline">Eliminar</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'finances' && user?.role === 'admin' && (
            <motion.div key="finances" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
              <div className="flex justify-between items-center print:hidden">
                <h2 className="text-2xl font-bold text-stone-800">Finanzas</h2>
                <div className="flex gap-3">
                  <button 
                    onClick={() => window.print()}
                    className="bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 px-4 py-2 rounded-xl font-medium transition-colors flex items-center gap-2"
                  >
                    <Printer size={18} />
                    Imprimir Reporte
                  </button>
                  <button 
                    onClick={() => setShowCloseYearModal(true)}
                    className="bg-stone-800 hover:bg-stone-900 text-white px-4 py-2 rounded-xl font-medium transition-colors flex items-center gap-2"
                  >
                    <Archive size={18} />
                    Cerrar Ejercicio
                  </button>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard 
                  label="Ingresos Totales" 
                  value={`$${finances?.totalRevenue.toLocaleString() ?? 0}`} 
                  icon={<TrendingUp className="text-emerald-600" />} 
                  description="Total facturado y pendiente"
                />
                <StatCard 
                  label="Gastos Totales" 
                  value={`$${finances?.totalExpenses.toLocaleString() ?? 0}`} 
                  icon={<Receipt className="text-red-600" />} 
                  description="Gastos operativos registrados"
                />
                <StatCard 
                  label="Balance Neto" 
                  value={`$${finances?.balance.toLocaleString() ?? 0}`} 
                  icon={<Wallet className="text-blue-600" />} 
                  description="Diferencia entre ingresos y gastos"
                />
              </div>

              <div className="space-y-8">
                {/* Operator Commissions - The primary focus */}
                <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                      <h3 className="font-bold text-lg">Reporte Individual de Operadores</h3>
                      <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">Comisión 8%</span>
                    </div>
                  </div>
                  <div className="space-y-6">
                    {finances?.operatorSummary.map((s, i) => (
                      <div key={i} className="border border-stone-200 rounded-xl overflow-hidden">
                        <div className="bg-stone-50 p-4 border-b border-stone-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                          <div>
                            <h4 className="font-bold text-stone-900 text-lg">#{s.operator_number} - {s.operator_name}</h4>
                            <p className="text-sm text-stone-500 font-medium">Total: {s.total_area} ha trabajadas</p>
                          </div>
                          <div className="flex gap-6 text-right">
                            <div>
                              <p className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Comisión Total</p>
                              <p className="text-xl font-black text-emerald-600 font-mono">${s.commission_amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-white border-b border-stone-100">
                              <tr>
                                <th className="px-4 py-2 font-bold text-stone-400 uppercase text-xs">Fecha</th>
                                <th className="px-4 py-2 font-bold text-stone-400 uppercase text-xs">Cliente</th>
                                <th className="px-4 py-2 font-bold text-stone-400 uppercase text-xs">Lote</th>
                                <th className="px-4 py-2 font-bold text-stone-400 uppercase text-xs text-right">Ha. Realizadas</th>
                                <th className="px-4 py-2 font-bold text-stone-400 uppercase text-xs text-right">Comisión</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-50 bg-white">
                              {s.jobs.map((job: any, j: number) => (
                                <tr key={j} className="hover:bg-stone-50/50 transition-colors">
                                  <td className="px-4 py-2 text-stone-600">{new Date(job.date).toLocaleDateString()}</td>
                                  <td className="px-4 py-2 font-medium text-stone-900">{job.client_name}</td>
                                  <td className="px-4 py-2 text-stone-600">{job.field_name}</td>
                                  <td className="px-4 py-2 font-mono text-stone-600 text-right">{job.machine_hectares} ha</td>
                                  <td className="px-4 py-2 font-mono font-bold text-emerald-600 text-right">${job.commission_amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                              ))}
                              {s.jobs.length === 0 && (
                                <tr>
                                  <td colSpan={5} className="px-4 py-4 text-center text-stone-400 italic">No hay trabajos registrados para este operador.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Client Summary */}
                <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
                  <h3 className="font-bold text-lg mb-6">Resumen por Cliente y Lote</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-stone-50 border-b border-stone-200">
                        <tr>
                          <th className="px-4 py-3 font-bold text-stone-500 uppercase">Cliente/Lote</th>
                          <th className="px-4 py-3 font-bold text-stone-500 uppercase">Ha. Lote</th>
                          <th className="px-4 py-3 font-bold text-stone-500 uppercase">Estado (ha)</th>
                          <th className="px-4 py-3 font-bold text-stone-500 uppercase text-right">Total ($)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {finances?.clientSummary.map((s, i) => (
                          <tr key={i} className="hover:bg-stone-50 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-bold text-stone-900">{s.client_name}</p>
                              <p className="text-xs text-stone-500">{s.field_name}</p>
                            </td>
                            <td className="px-4 py-3 font-mono text-stone-600">{s.total_lot_area} ha</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-emerald-600 font-mono text-[10px]">{s.invoiced_area} ha Fact.</span>
                                <span className="text-amber-600 font-mono text-[10px]">{s.pending_area} ha Pend.</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-stone-900 font-mono">
                              ${s.total_revenue.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Billing Management */}
              <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-lg">Gestión de Facturación y Cobros</h3>
                  <div className="flex gap-2">
                    <span className="flex items-center gap-1 text-[10px] font-bold text-stone-400 uppercase">
                      <div className="w-2 h-2 rounded-full bg-amber-400" /> Pendiente
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-stone-400 uppercase">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" /> Facturado
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-stone-50 border-b border-stone-200">
                      <tr>
                        <th className="px-4 py-3 font-bold text-stone-500 uppercase">Fecha</th>
                        <th className="px-4 py-3 font-bold text-stone-500 uppercase">Cliente / Campo</th>
                        <th className="px-4 py-3 font-bold text-stone-500 uppercase">Ha. Realizadas</th>
                        <th className="px-4 py-3 font-bold text-stone-500 uppercase">Estado</th>
                        <th className="px-4 py-3 font-bold text-stone-500 uppercase">IVA</th>
                        <th className="px-4 py-3 font-bold text-stone-500 uppercase">Cobrado</th>
                        <th className="px-4 py-3 font-bold text-stone-500 uppercase text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {jobs.map(job => (
                        <tr key={job.id} className="hover:bg-stone-50 transition-colors">
                          <td className="px-4 py-3 text-stone-500 font-mono text-xs">
                            {new Date(job.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-bold text-stone-900">{job.field_name}</p>
                            <p className="text-xs text-stone-500">{job.client_name}</p>
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-stone-700">{job.machine_hectares} ha</td>
                          <td className="px-4 py-3">
                            <select 
                              value={job.invoicing_status}
                              onChange={async (e) => {
                                await fetch(`/api/jobs/${job.id}/billing`, {
                                  method: 'PATCH',
                                  headers: { 
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                  },
                                  body: JSON.stringify({ invoicing_status: e.target.value, vat_rate: job.vat_rate }),
                                });
                                fetchData();
                              }}
                              className={`text-[10px] font-bold uppercase rounded px-2 py-1 border-none focus:ring-2 focus:ring-stone-200 cursor-pointer ${
                                job.invoicing_status === 'invoiced' ? 'bg-emerald-100 text-emerald-700' : 
                                job.invoicing_status === 'no_invoice' ? 'bg-stone-100 text-stone-700' : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              <option value="pending">Pendiente</option>
                              <option value="invoiced">Facturado</option>
                              <option value="no_invoice">Sin Factura</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <select 
                              value={job.vat_rate}
                              onChange={async (e) => {
                                await fetch(`/api/jobs/${job.id}/billing`, {
                                  method: 'PATCH',
                                  headers: { 
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                  },
                                  body: JSON.stringify({ invoicing_status: job.invoicing_status, vat_rate: Number(e.target.value) }),
                                });
                                fetchData();
                              }}
                              className="text-[10px] font-bold bg-stone-100 border-none rounded px-2 py-1 focus:ring-2 focus:ring-stone-200 cursor-pointer"
                            >
                              <option value="0">Sin IVA</option>
                              <option value="10.5">10.5%</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <label className="flex items-center cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={!!job.paid}
                                onChange={async (e) => {
                                  await fetch(`/api/jobs/${job.id}/billing`, {
                                    method: 'PATCH',
                                    headers: { 
                                      'Content-Type': 'application/json',
                                      'Authorization': `Bearer ${token}`
                                    },
                                    body: JSON.stringify({ 
                                      invoicing_status: job.invoicing_status, 
                                      vat_rate: job.vat_rate,
                                      paid: e.target.checked 
                                    }),
                                  });
                                  fetchData();
                                }}
                                className="w-4 h-4 text-emerald-500 bg-stone-100 border-stone-300 rounded focus:ring-emerald-500 focus:ring-2 cursor-pointer"
                              />
                            </label>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button 
                                onClick={() => {/* Ver detalle o editar */}}
                                className="p-2 hover:bg-stone-200 rounded-lg transition-colors text-stone-400 hover:text-stone-600"
                                title="Ver Detalle"
                              >
                                <Receipt size={16} />
                              </button>
                              <button 
                                onClick={() => setJobToDelete(job.id)}
                                className="p-2 hover:bg-red-100 rounded-lg transition-colors text-red-400 hover:text-red-600"
                                title="Eliminar Trabajo"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Expenses Section */}
              {user?.role === 'admin' && (
                <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
                  <h3 className="font-bold text-lg mb-6">Planilla de Gastos Operativos</h3>
                  <form onSubmit={handleAddExpense} className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 bg-stone-50 p-4 rounded-xl border border-stone-100">
                    <Input name="description" label="Descripción" placeholder="Ej: Combustible, Repuestos" required />
                    <Input name="amount" label="Monto ($)" type="number" step="0.01" placeholder="0.00" required />
                    <Input name="date" label="Fecha" type="date" required defaultValue={new Date().toISOString().split('T')[0]} />
                    <div className="flex items-end">
                      <button type="submit" className="w-full bg-stone-900 text-white py-2.5 rounded-lg font-bold hover:bg-stone-800 transition-all active:scale-95">
                        Registrar Gasto
                      </button>
                    </div>
                  </form>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-stone-50 border-b border-stone-200">
                        <tr>
                          <th className="px-4 py-3 font-bold text-stone-500 uppercase">Fecha</th>
                          <th className="px-4 py-3 font-bold text-stone-500 uppercase">Descripción</th>
                          <th className="px-4 py-3 font-bold text-stone-500 uppercase text-right">Monto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {expenses.map(e => (
                          <tr key={e.id} className="hover:bg-stone-50 transition-colors">
                            <td className="px-4 py-3 text-stone-500 font-mono text-xs">
                              {new Date(e.date).toLocaleDateString('es-AR')}
                            </td>
                            <td className="px-4 py-3 font-medium text-stone-900">{e.description}</td>
                            <td className="px-4 py-3 text-right font-bold text-red-600 font-mono">
                              -${e.amount.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                        {finances?.operatorSummary.filter(op => op.commission_amount > 0).map(op => (
                          <tr key={`comm-${op.operator_id}`} className="hover:bg-stone-50 transition-colors bg-orange-50/30">
                            <td className="px-4 py-3 text-stone-500 font-mono text-xs">-</td>
                            <td className="px-4 py-3 font-medium text-stone-900">Comisión Operario: {op.operator_name}</td>
                            <td className="px-4 py-3 text-right font-bold text-red-600 font-mono">
                              -${op.commission_amount.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                        {expenses.length === 0 && (!finances?.operatorSummary || finances.operatorSummary.filter(op => op.commission_amount > 0).length === 0) && (
                          <tr>
                            <td colSpan={3} className="px-4 py-8 text-center text-stone-400 italic">
                              No hay gastos registrados aún.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'financial_years' && user?.role === 'admin' && (
            <motion.div key="financial_years" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-stone-800">Ejercicios Financieros</h2>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-4 print:hidden">
                  <h3 className="font-bold text-lg text-stone-800">Historial de Ejercicios</h3>
                  <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-stone-100">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
                        <input
                          type="text"
                          placeholder="Buscar ejercicio..."
                          value={financialYearSearch}
                          onChange={(e) => setFinancialYearSearch(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                    {financialYears.filter(fy => fy.name.toLowerCase().includes(financialYearSearch.toLowerCase())).length === 0 ? (
                      <div className="p-6 text-center text-stone-500 italic">No hay ejercicios que coincidan.</div>
                    ) : (
                      <ul className="divide-y divide-stone-100 max-h-[600px] overflow-y-auto">
                        {financialYears.filter(fy => fy.name.toLowerCase().includes(financialYearSearch.toLowerCase())).map(fy => (
                          <li key={fy.id}>
                            <button
                              onClick={() => {
                                setSelectedFinancialYear(fy);
                                fetchFinancialYearData(fy.id);
                              }}
                              className={`w-full text-left p-4 hover:bg-stone-50 transition-colors flex justify-between items-center ${selectedFinancialYear?.id === fy.id ? 'bg-emerald-50/50 border-l-4 border-emerald-500' : ''}`}
                            >
                              <div>
                                <p className="font-bold text-stone-800">{fy.name}</p>
                                <p className="text-xs text-stone-500">Hasta: {new Date(fy.end_date).toLocaleDateString()}</p>
                              </div>
                              <Archive size={16} className={selectedFinancialYear?.id === fy.id ? 'text-emerald-500' : 'text-stone-400'} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-2 print:col-span-3">
                  {selectedFinancialYear ? (
                    <div className="space-y-8">
                      {(() => {
                        const groupedJobs = selectedFinancialYearData?.jobs?.reduce((acc: any, job: any) => {
                          const opName = job.operator_name || 'Sin Operario';
                          if (!acc[opName]) {
                            acc[opName] = {
                              operator_name: opName,
                              operator_number: job.operator_number,
                              jobs: [],
                              total_commission: 0,
                              total_amount: 0,
                              total_hectares: 0
                            };
                          }
                          acc[opName].jobs.push(job);
                          if (job.operator_name) {
                            const rate = (job.operator_commission_rate ?? 8) / 100;
                            acc[opName].total_commission += (job.total_amount * rate);
                          }
                          acc[opName].total_amount += job.total_amount;
                          acc[opName].total_hectares += job.machine_hectares;
                          return acc;
                        }, {});
                        
                        const operatorsList = groupedJobs ? Object.values(groupedJobs).sort((a: any, b: any) => a.operator_name.localeCompare(b.operator_name)) : [];
                        
                        const totalIncome = selectedFinancialYearData?.jobs?.reduce((sum: number, job: any) => sum + job.total_amount, 0) || 0;
                        const totalExpenses = selectedFinancialYearData?.expenses?.reduce((sum: number, exp: any) => sum + exp.amount, 0) || 0;
                        const totalCommissions = operatorsList.reduce((sum: number, op: any) => sum + op.total_commission, 0);
                        const totalExpensesWithCommissions = totalExpenses + totalCommissions;
                        const balance = totalIncome - totalExpensesWithCommissions;

                        return (
                          <>
                            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
                              <div>
                                <h3 className="text-xl font-bold text-stone-800">{selectedFinancialYear.name}</h3>
                                <p className="text-sm text-stone-500">Hasta: {new Date(selectedFinancialYear.end_date).toLocaleDateString()}</p>
                              </div>
                              <div className="flex gap-2 print:hidden">
                                <button
                                  onClick={() => {
                                    if (selectedFinancialYear && selectedFinancialYearData) {
                                      const groupedJobs = selectedFinancialYearData.jobs.reduce((acc: any, job: any) => {
                                        const opName = job.operator_name || 'Sin Operario';
                                        if (!acc[opName]) {
                                          acc[opName] = {
                                            operator_name: opName,
                                            operator_number: job.operator_number,
                                            jobs: [],
                                            total_commission: 0,
                                            total_amount: 0,
                                            total_hectares: 0
                                          };
                                        }
                                        acc[opName].jobs.push(job);
                                        if (job.operator_name) {
                                          const rate = (job.operator_commission_rate ?? 8) / 100;
                                          acc[opName].total_commission += (job.total_amount * rate);
                                        }
                                        acc[opName].total_amount += job.total_amount;
                                        acc[opName].total_hectares += job.machine_hectares;
                                        return acc;
                                      }, {});
                                      
                                      const operatorsList = Object.values(groupedJobs).sort((a: any, b: any) => a.operator_name.localeCompare(b.operator_name));
                                      
                                      const totalIncome = selectedFinancialYearData.jobs.reduce((sum: number, job: any) => sum + job.total_amount, 0) || 0;
                                      const totalExpenses = selectedFinancialYearData.expenses?.reduce((sum: number, exp: any) => sum + exp.amount, 0) || 0;
                                      const totalCommissions = operatorsList.reduce((sum: number, op: any) => sum + op.total_commission, 0);
                                      const totalJobs = selectedFinancialYearData.jobs.length;
                                      const totalHectares = operatorsList.reduce((sum: number, op: any) => sum + op.total_hectares, 0);
                                      
                                      generateFinancialYearPDF({
                                        year: selectedFinancialYear,
                                        operators: operatorsList,
                                        expenses: selectedFinancialYearData.expenses || [],
                                        summary: {
                                          totalIncome,
                                          totalExpenses,
                                          totalCommissions,
                                          balance: totalIncome - (totalExpenses + totalCommissions),
                                          totalJobs,
                                          totalHectares
                                        }
                                      });
                                    }
                                  }}
                                  className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors"
                                >
                                  <FileDown size={16} />
                                  <span className="font-medium">Descargar PDF</span>
                                </button>
                                <button
                                  onClick={() => window.print()}
                                  className="flex items-center gap-2 px-4 py-2 bg-stone-100 text-stone-700 rounded-lg hover:bg-stone-200 transition-colors"
                                >
                                  <Printer size={16} />
                                  <span className="font-medium">Imprimir</span>
                                </button>
                                <button
                                  onClick={() => setShowDeleteYearModal(true)}
                                  className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                                >
                                  <Trash2 size={16} />
                                  <span className="font-medium">Eliminar</span>
                                </button>
                              </div>
                            </div>
                            <div className="space-y-6">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 print:grid-cols-3">
                                <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm print:p-2 print-no-shadow">
                                  <p className="text-sm font-bold text-stone-500 uppercase mb-1 print:text-sm">Ingresos Totales</p>
                                  <p className="text-2xl font-bold text-emerald-600 print:text-xl">${totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                                <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm print:p-2 print-no-shadow">
                                  <p className="text-sm font-bold text-stone-500 uppercase mb-1 print:text-sm">Egresos Totales</p>
                                  <p className="text-2xl font-bold text-red-600 print:text-xl">${totalExpensesWithCommissions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                                <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm print:p-2 print-no-shadow">
                                  <p className="text-sm font-bold text-stone-500 uppercase mb-1 print:text-sm">Balance</p>
                                  <p className={`text-2xl font-bold ${balance >= 0 ? 'text-emerald-600' : 'text-red-600'} print:text-xl`}>
                                    ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </p>
                                </div>
                              </div>
                              <h3 className="font-bold text-lg">Trabajos del Ejercicio: {selectedFinancialYear.name}</h3>
                              {operatorsList.length === 0 && (
                                <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center text-stone-400 italic shadow-sm">
                                  No hay trabajos en este ejercicio.
                                </div>
                              )}
                              {operatorsList.map((op: any) => (
                                <div key={op.operator_name} className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
                                  <div className="bg-stone-50 p-4 border-b border-stone-200 flex justify-between items-center">
                                    <div>
                                      <h4 className="font-bold text-stone-800 text-lg">{op.operator_name}</h4>
                                      {op.operator_number && <p className="text-xs text-stone-500">Legajo: {op.operator_number}</p>}
                                    </div>
                                    <div className="text-right flex gap-6">
                                      <div>
                                        <p className="text-xs font-bold text-stone-500 uppercase">Hectáreas</p>
                                        <p className="font-bold text-stone-800">{op.total_hectares} ha</p>
                                      </div>
                                      {op.operator_name !== 'Sin Operario' && (
                                        <div>
                                          <p className="text-xs font-bold text-emerald-600 uppercase">Comisión (8%)</p>
                                          <p className="font-bold text-emerald-700">${op.total_commission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                      <thead className="bg-white border-b border-stone-100">
                                        <tr>
                                          <th className="px-4 py-3 font-bold text-stone-500 uppercase">Fecha</th>
                                          <th className="px-4 py-3 font-bold text-stone-500 uppercase">Cliente</th>
                                          <th className="px-4 py-3 font-bold text-stone-500 uppercase">Lote</th>
                                          <th className="px-4 py-3 font-bold text-stone-500 uppercase text-right">Ha.</th>
                                          <th className="px-4 py-3 font-bold text-stone-500 uppercase text-right">Total</th>
                                          {op.operator_name !== 'Sin Operario' && (
                                            <th className="px-4 py-3 font-bold text-emerald-600 uppercase text-right">Comisión</th>
                                          )}
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-stone-100">
                                        {op.jobs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((job: any) => (
                                          <tr key={job.id} className="hover:bg-stone-50/50 transition-colors">
                                            <td className="px-4 py-3 text-stone-600">{new Date(job.date).toLocaleDateString()}</td>
                                            <td className="px-4 py-3 font-medium text-stone-900">{job.client_name}</td>
                                            <td className="px-4 py-3 text-stone-600">{job.field_name}</td>
                                            <td className="px-4 py-3 text-stone-600 text-right">{job.machine_hectares}</td>
                                            <td className="px-4 py-3 font-mono text-stone-600 text-right">${job.total_amount.toLocaleString()}</td>
                                            {op.operator_name !== 'Sin Operario' && (
                                              <td className="px-4 py-3 font-mono font-bold text-emerald-600 text-right">${(job.total_amount * ((job.operator_commission_rate ?? 8) / 100)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            )}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
                              <h3 className="font-bold text-lg mb-4">Gastos del Ejercicio: {selectedFinancialYear.name}</h3>
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                  <thead className="bg-stone-50 border-b border-stone-200">
                                    <tr>
                                      <th className="px-4 py-3 font-bold text-stone-500 uppercase">Fecha</th>
                                      <th className="px-4 py-3 font-bold text-stone-500 uppercase">Descripción</th>
                                      <th className="px-4 py-3 font-bold text-stone-500 uppercase">Categoría</th>
                                      <th className="px-4 py-3 font-bold text-stone-500 uppercase text-right">Monto</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-stone-100">
                                    {selectedFinancialYearData?.expenses?.map((exp: any) => (
                                      <tr key={exp.id} className="hover:bg-stone-50/50 transition-colors">
                                        <td className="px-4 py-3 text-stone-600">{new Date(exp.date).toLocaleDateString()}</td>
                                        <td className="px-4 py-3 font-medium text-stone-900">{exp.description}</td>
                                        <td className="px-4 py-3 text-stone-600">
                                          <span className="bg-stone-100 text-stone-600 px-2 py-1 rounded-md text-xs font-medium">
                                            {exp.category}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 font-mono font-bold text-red-600 text-right">${exp.amount.toLocaleString()}</td>
                                      </tr>
                                    ))}
                                    {operatorsList.filter((op: any) => op.total_commission > 0).map((op: any) => (
                                      <tr key={`comm-${op.operator_name}`} className="hover:bg-stone-50/50 transition-colors bg-orange-50/30">
                                        <td className="px-4 py-3 text-stone-600">-</td>
                                        <td className="px-4 py-3 font-medium text-stone-900">Comisión Operario: {op.operator_name}</td>
                                        <td className="px-4 py-3 text-stone-600">
                                          <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-md text-xs font-medium">
                                            Comisiones
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 font-mono font-bold text-red-600 text-right">${op.total_commission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                      </tr>
                                    ))}
                                    {(!selectedFinancialYearData?.expenses || selectedFinancialYearData.expenses.length === 0) && operatorsList.filter((op: any) => op.total_commission > 0).length === 0 && (
                                      <tr>
                                        <td colSpan={4} className="px-4 py-8 text-center text-stone-400 italic">No hay gastos en este ejercicio.</td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="bg-stone-50 rounded-2xl border border-stone-200 p-12 text-center text-stone-500 flex flex-col items-center justify-center h-full min-h-[400px]">
                      <Archive size={48} className="text-stone-300 mb-4" />
                      <p className="text-lg font-medium">Selecciona un ejercicio para ver sus detalles</p>
                      <p className="text-sm mt-2">Podrás ver todos los trabajos y gastos archivados.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'users' && user?.role === 'admin' && (
            <motion.div key="users" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
              <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
                <h3 className="font-bold text-lg mb-6">Crear Nuevo Usuario</h3>
                {userCreateError && (
                  <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                    {userCreateError}
                  </div>
                )}
                <form onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Input name="username" label="Usuario" placeholder="Nombre de usuario" required />
                  <Input name="password" label="Contraseña" type="password" placeholder="••••••••" required />
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-500 uppercase">Rol</label>
                    <select name="role" className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" required>
                      <option value="operator">Operario</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                  <Input name="operator_number" label="Nº de Ingreso (Solo Operarios)" type="number" placeholder="Ej: 1" />
                  <Input name="commission_rate" label="Comisión (%)" type="number" step="0.1" placeholder="Ej: 8" defaultValue="8" />
                  <Input name="secret_question" label="Pregunta Secreta" placeholder="Ej: ¿Nombre de mi primera mascota?" required />
                  <Input name="secret_answer" label="Respuesta Secreta" placeholder="Tu respuesta secreta" required />
                  <div className="md:col-span-4 flex justify-end">
                    <button type="submit" className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2">
                      <UserPlus size={18} /> Crear Usuario
                    </button>
                  </div>
                </form>
              </div>

              <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-stone-50 border-b border-stone-200">
                    <tr>
                      <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Usuario</th>
                      <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Rol</th>
                      <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Nº Operario</th>
                      <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Comisión (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {allUsers.map(u => (
                      <tr key={u.id}>
                        <td className="px-6 py-4 font-bold">{u.username}</td>
                        <td className="px-6 py-4">
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {u.role === 'admin' ? 'Administrador' : 'Operario'}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono">{u.operator_number ?? '-'}</td>
                        <td className="px-6 py-4 font-mono">
                          {u.role === 'operator' ? (
                            <div className="flex items-center gap-2">
                              <input 
                                type="number" 
                                step="0.1"
                                defaultValue={u.commission_rate ?? 8}
                                onBlur={async (e) => {
                                  const newRate = Number(e.target.value);
                                  if (newRate !== (u.commission_rate ?? 8)) {
                                    await fetch(`/api/users/${u.id}`, {
                                      method: 'PATCH',
                                      headers: { 
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${token}`
                                      },
                                      body: JSON.stringify({ commission_rate: newRate })
                                    });
                                    fetchData();
                                  }
                                }}
                                className="w-20 bg-stone-50 border border-stone-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                              <span className="text-stone-500">%</span>
                            </div>
                          ) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Close Year Modal */}
        <AnimatePresence>
          {showCloseYearModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
              >
                <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50">
                  <h3 className="font-bold text-lg text-stone-800">Cerrar Ejercicio</h3>
                  <button onClick={() => setShowCloseYearModal(false)} className="text-stone-400 hover:text-stone-600 transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <form onSubmit={handleCloseYear} className="p-6 space-y-4">
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm mb-4">
                    <strong>Atención:</strong> Esta acción archivará todos los trabajos y gastos actuales hasta la fecha seleccionada. Los contadores de hectáreas se reiniciarán a 0, pero los clientes y lotes se mantendrán.
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-stone-700 mb-1">Fecha de Cierre</label>
                    <input 
                      type="date" 
                      required 
                      value={closeYearForm.end_date}
                      onChange={e => setCloseYearForm({...closeYearForm, end_date: e.target.value})}
                      className="w-full rounded-xl border-stone-200 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 bg-stone-50 p-3"
                    />
                  </div>
                  <div className="pt-4 flex justify-end gap-3">
                    <button 
                      type="button" 
                      onClick={() => setShowCloseYearModal(false)}
                      className="px-4 py-2 text-stone-600 font-medium hover:bg-stone-100 rounded-xl transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit" 
                      className="bg-stone-800 hover:bg-stone-900 text-white px-6 py-2 rounded-xl font-medium transition-colors"
                    >
                      Confirmar Cierre
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Edit Field Modal */}
        <AnimatePresence>
          {editingField && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
              >
                <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50">
                  <h3 className="font-bold text-lg">Editar Campo</h3>
                  <button onClick={() => setEditingField(null)} className="text-stone-400 hover:text-stone-600 transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const data = Object.fromEntries(formData.entries());
                  
                  await fetch(`/api/fields/${editingField.id}`, {
                    method: 'PATCH',
                    headers: { 
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                      name: data.name,
                      area: Number(data.area)
                    })
                  });
                  
                  setEditingField(null);
                  fetchData();
                }} className="p-6 space-y-4">
                  <Input name="name" label="Nombre del Campo" defaultValue={editingField.name} required />
                  <Input name="area" type="number" label="Área (hectáreas)" defaultValue={editingField.area} required step="0.01" />
                  
                  <div className="flex gap-3 pt-4 border-t border-stone-100">
                    <button 
                      type="button"
                      onClick={() => setEditingField(null)}
                      className="flex-1 px-4 py-2 text-stone-600 font-bold hover:bg-stone-50 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 px-4 py-2 bg-emerald-500 text-white font-bold rounded-lg hover:bg-emerald-600 transition-colors"
                    >
                      Guardar Cambios
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Edit Client Modal */}
        <AnimatePresence>
          {editingClient && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
              >
                <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50">
                  <h3 className="font-bold text-lg">Editar Cliente</h3>
                  <button onClick={() => setEditingClient(null)} className="text-stone-400 hover:text-stone-600 transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const data = Object.fromEntries(formData.entries());
                  
                  const res = await fetch(`/api/clients/${editingClient.id}`, {
                    method: 'PATCH',
                    headers: { 
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(data)
                  });
                  
                  if (!res.ok) {
                    const err = await res.json();
                    alert(err.error || "Error al actualizar cliente");
                    return;
                  }
                  
                  setEditingClient(null);
                  fetchData();
                }} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                  <Input name="name" label="Nombre / Razón Social" defaultValue={editingClient.name} required />
                  <Input name="responsible" label="Responsable" defaultValue={editingClient.responsible} />
                  <Input name="cuit" label="CUIT" defaultValue={editingClient.cuit} />
                  <Input name="address" label="Dirección" defaultValue={editingClient.address} />
                  <Input name="city" label="Ciudad" defaultValue={editingClient.city} />
                  <Input name="phone" label="Teléfono" defaultValue={editingClient.phone} />
                  <Input name="email" type="email" label="Email" defaultValue={editingClient.email} />
                  
                  <div className="flex gap-3 pt-4 border-t border-stone-100 sticky bottom-0 bg-white">
                    <button 
                      type="button"
                      onClick={() => setEditingClient(null)}
                      className="flex-1 px-4 py-2 text-stone-600 font-bold hover:bg-stone-50 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 px-4 py-2 bg-emerald-500 text-white font-bold rounded-lg hover:bg-emerald-600 transition-colors"
                    >
                      Guardar Cambios
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Delete Year Modal */}
        <AnimatePresence>
          {showDeleteYearModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
              >
                <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-red-50">
                  <h3 className="font-bold text-lg text-red-800">Eliminar Ejercicio</h3>
                  <button onClick={() => {
                    setShowDeleteYearModal(false);
                    setDeleteYearPassword('');
                    setDeleteYearError('');
                  }} className="text-red-400 hover:text-red-600 transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <form onSubmit={handleDeleteYear} className="p-6 space-y-4">
                  <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl text-sm mb-4">
                    <strong>¡Peligro!</strong> Estás a punto de eliminar el ejercicio <strong>{selectedFinancialYear?.name}</strong>. Esta acción <strong>eliminará permanentemente</strong> todos los trabajos y gastos asociados a este ejercicio. Los clientes y lotes no serán borrados.
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-stone-700 mb-1">Contraseña de Administrador</label>
                    <input 
                      type="password" 
                      required 
                      value={deleteYearPassword}
                      onChange={e => setDeleteYearPassword(e.target.value)}
                      placeholder="Ingresa tu contraseña para confirmar"
                      className="w-full rounded-xl border-stone-200 shadow-sm focus:border-red-500 focus:ring-red-500 bg-stone-50 p-3"
                    />
                    {deleteYearError && <p className="text-red-500 text-sm mt-2">{deleteYearError}</p>}
                  </div>
                  <div className="pt-4 flex justify-end gap-3">
                    <button 
                      type="button" 
                      onClick={() => {
                        setShowDeleteYearModal(false);
                        setDeleteYearPassword('');
                        setDeleteYearError('');
                      }}
                      className="px-4 py-2 text-stone-600 font-medium hover:bg-stone-100 rounded-xl transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit" 
                      className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-xl font-medium transition-colors"
                    >
                      Eliminar Definitivamente
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Quick Field Modal */}
        <AnimatePresence>
          {showQuickFieldModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
              >
                <div className="p-6 border-b border-stone-100 flex justify-between items-center">
                  <h3 className="font-bold text-xl">Nuevo Lote / Campo</h3>
                  <button onClick={() => setShowQuickFieldModal(false)} className="text-stone-400 hover:text-stone-600">×</button>
                </div>
                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const data = Object.fromEntries(formData.entries());
                    await fetch('/api/fields', {
                      method: 'POST',
                      headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                      },
                      body: JSON.stringify({
                        ...data,
                        client_id: Number(data.client_id),
                        area: Number(data.area)
                      }),
                    });
                    fetchData();
                    setShowQuickFieldModal(false);
                  }}
                  className="p-6 space-y-4"
                >
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-500 uppercase">Asociar a Cliente</label>
                    <select name="client_id" className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" required>
                      <option value="">Seleccionar Cliente</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <Input name="name" label="Nombre del Lote / Campo" placeholder="Ej: Lote 14 o 'La Loma'" required />
                  <Input name="area" label="Superficie (Hectáreas)" type="number" step="0.01" placeholder="Ej: 45.5" required />
                  
                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button" 
                      onClick={() => setShowQuickFieldModal(false)}
                      className="flex-1 px-4 py-2 border border-stone-200 rounded-lg font-bold text-stone-600 hover:bg-stone-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100"
                    >
                      Guardar Lote
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Delete Job Confirmation Modal */}
        <AnimatePresence>
          {jobToDelete !== null && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
              >
                <div className="p-6 border-b border-stone-100 flex justify-between items-center">
                  <h3 className="text-xl font-bold text-red-600">Eliminar Trabajo</h3>
                  <button onClick={() => setJobToDelete(null)} className="text-stone-400 hover:text-stone-600">
                    <X size={24} />
                  </button>
                </div>
                <div className="p-6 space-y-6">
                  <p className="text-stone-600">
                    ¿Está seguro de que desea eliminar este trabajo? Esta acción no se puede deshacer.
                  </p>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setJobToDelete(null)} className="flex-1 px-4 py-2.5 rounded-lg font-bold text-stone-600 hover:bg-stone-100 transition-colors">
                      Cancelar
                    </button>
                    <button type="button" onClick={() => deleteJob(jobToDelete)} className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-bold hover:bg-red-700 transition-all active:scale-95">
                      Eliminar
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        {/* Delete Client Confirmation Modal */}
        <AnimatePresence>
          {clientToDelete !== null && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
              >
                <div className="p-6 border-b border-stone-100 flex justify-between items-center">
                  <h3 className="text-xl font-bold text-red-600">Eliminar Cliente</h3>
                  <button onClick={() => setClientToDelete(null)} className="text-stone-400 hover:text-stone-600">
                    <X size={24} />
                  </button>
                </div>
                <div className="p-6 space-y-6">
                  <p className="text-stone-600">
                    ¿Está seguro de que desea eliminar este cliente y todos sus campos? Esta acción no se puede deshacer.
                  </p>
                  <p className="text-xs text-red-500 font-bold">
                    Solo se puede eliminar si no tiene pulverizaciones asociadas.
                  </p>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setClientToDelete(null)} className="flex-1 px-4 py-2.5 rounded-lg font-bold text-stone-600 hover:bg-stone-100 transition-colors">
                      Cancelar
                    </button>
                    <button type="button" onClick={() => deleteClient(clientToDelete)} className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-bold hover:bg-red-700 transition-all active:scale-95">
                      Eliminar
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
        active 
          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200' 
          : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({ label, value, icon, description }: { label: string, value: string | number, icon: React.ReactNode, description?: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 bg-stone-50 rounded-lg">{icon}</div>
      </div>
      <p className="text-stone-500 text-xs font-bold uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {description && <p className="text-[10px] text-stone-400 mt-1">{description}</p>}
    </div>
  );
}

function Input({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-bold text-stone-500 uppercase">{label}</label>
      <input 
        {...props}
        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
      />
    </div>
  );
}

function QuickActionBtn({ label, icon, onClick }: { label: string, icon: React.ReactNode, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 p-4 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-center"
    >
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
    </button>
  );
}
