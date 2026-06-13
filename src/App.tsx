import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/master/Products';
import PriceHistory from './pages/master/PriceHistory';
import Tanks from './pages/master/Tanks';
import Dispensers from './pages/master/Dispensers';
import Nozzles from './pages/master/Nozzles';
import Meters from './pages/master/Meters';
import Operators from './pages/master/Operators';
import Shifts from './pages/master/Shifts';
import BankAccounts from './pages/master/BankAccounts';
import Suppliers from './pages/master/Suppliers';
import TankerUnloading from './pages/ops/TankerUnloading';
import DipVolume from './pages/ops/DipVolume';
import DipReadings from './pages/ops/DipReadings';
import Stock from './pages/ops/Stock';
import Sales from './pages/ops/Sales';
import LossGain from './pages/ops/LossGain';
import CreditSales from './pages/finance/CreditSales';
import Finance from './pages/finance/Finance';
import Reports from './pages/Reports';
import SalesUpload from './pages/bulk/SalesUpload';
import TankDataUpload from './pages/bulk/TankDataUpload';
import InventoryUpload from './pages/bulk/InventoryUpload';
import DailySalesUpload from './pages/bulk/DailySalesUpload';
import DipReadingsUpload from './pages/bulk/DipReadingsUpload';
import CalibrationUpload from './pages/bulk/CalibrationUpload';
import CreditSalesUpload from './pages/bulk/CreditSalesUpload';
import TankerUnloadingUpload from './pages/bulk/TankerUnloadingUpload';
import ProjectPlan from './pages/docs/ProjectPlan';
import Backend from './pages/docs/Backend';
import Android from './pages/docs/Android';
import Testing from './pages/docs/Testing';

const P = ({ children }: { children: React.ReactNode }) => <ProtectedRoute><Layout>{children}</Layout></ProtectedRoute>;

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<P><Dashboard /></P>} />
          <Route path="/master/products" element={<P><Products /></P>} />
          <Route path="/master/price-history" element={<P><PriceHistory /></P>} />
          <Route path="/master/tanks" element={<P><Tanks /></P>} />
          <Route path="/master/dispensers" element={<P><Dispensers /></P>} />
          <Route path="/master/nozzles" element={<P><Nozzles /></P>} />
          <Route path="/master/meters" element={<P><Meters /></P>} />
          <Route path="/master/operators" element={<P><Operators /></P>} />
          <Route path="/master/shifts" element={<P><Shifts /></P>} />
          <Route path="/master/bank-accounts" element={<P><BankAccounts /></P>} />
          <Route path="/master/suppliers" element={<P><Suppliers /></P>} />
          <Route path="/ops/tanker-unloading" element={<P><TankerUnloading /></P>} />
          <Route path="/ops/dip-volume" element={<P><DipVolume /></P>} />
          <Route path="/ops/dip-readings" element={<P><DipReadings /></P>} />
          <Route path="/ops/stock" element={<P><Stock /></P>} />
          <Route path="/ops/sales" element={<P><Sales /></P>} />
          <Route path="/ops/loss-gain" element={<P><LossGain /></P>} />
          <Route path="/finance/credit-sales" element={<P><CreditSales /></P>} />
          <Route path="/finance/management" element={<P><Finance /></P>} />
          <Route path="/reports" element={<P><Reports /></P>} />
          <Route path="/bulk/sales" element={<P><SalesUpload /></P>} />
          <Route path="/bulk/tank-data" element={<P><TankDataUpload /></P>} />
          <Route path="/bulk/inventory" element={<P><InventoryUpload /></P>} />
          <Route path="/bulk/daily-sales" element={<P><DailySalesUpload /></P>} />
          <Route path="/bulk/dip-readings" element={<P><DipReadingsUpload /></P>} />
          <Route path="/bulk/calibration" element={<P><CalibrationUpload /></P>} />
          <Route path="/bulk/credit-sales" element={<P><CreditSalesUpload /></P>} />
          <Route path="/bulk/tanker-unloading" element={<P><TankerUnloadingUpload /></P>} />
          <Route path="/docs/project-plan" element={<P><ProjectPlan /></P>} />
          <Route path="/docs/backend" element={<P><Backend /></P>} />
          <Route path="/docs/android" element={<P><Android /></P>} />
          <Route path="/docs/testing" element={<P><Testing /></P>} />
          <Route path="*" element={<P><div className="flex flex-col items-center justify-center py-24"><h1 className="text-4xl font-bold text-slate-300">404</h1><p className="text-slate-500 mt-2">Page not found</p></div></P>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
