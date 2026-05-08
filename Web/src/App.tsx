import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import App_User from "./pages/App_User";
import Sap_sync from "./pages/Sap_Sync";
import Add_Sales from "./pages/Add_Sales";
import View_Orders from "./pages/View_Orders";
import Auditor_orders from "./pages/Auditor_Order";
import Billing_orders from "./pages/Billing_Order";
import Order_Status_Tracking from "./pages/Order_Status_Tracking";
import Daily_Report from "./pages/Daily_Report";
import PersonWise_Report from "./pages/PersonWise_Report";
import Sales_Report from "./pages/Sales_Report";
import Order_Tracking from "./pages/Order_Tracking";
import "./styles/AppShell.css";
import "./styles/UIConsistency.css";
import Party_Assignment from "./pages/Party_Assignment";
import Party_Product_Assignment from "./pages/Party_Product_Assignment";
import Add_Scheme from "./pages/Add_Scheme";
import NewInvoice from "./pages/NewInvoice";

function App() {
  return (
    <BrowserRouter>
       <Routes>
      
        <Route path="/" element={<Login />} />

        <Route
          path="/Dashboard"
          element={
            <Sidebar>
              <Dashboard />
              </Sidebar>}
        />      

        <Route
          path="/App_User"
          element={
            <Sidebar>
              <App_User />
              </Sidebar>}
        />      
        

        <Route
          path="/Sap_Sync"
          element={
            <Sidebar>
              <Sap_sync />
              </Sidebar>}
        />      

       <Route
          path="/Add_Sales"
          element={
            <Sidebar>
              <Add_Sales />
              </Sidebar>}
        />     

         <Route
          path="/View_Orders"
          element={
            <Sidebar>
              <View_Orders />
              </Sidebar>}
        />

        <Route
          path="/Auditor_orders"
          element={
            <Sidebar>
              <Auditor_orders />
            </Sidebar>}
        />

        <Route
          path="/Billing_orders"
          element={
            <Sidebar>
              <Billing_orders />
            </Sidebar>}
        />

        <Route
          path="/Auditor_status_tracking"
          element={
            <Sidebar>
              <Order_Status_Tracking mode="auditor" />
            </Sidebar>}
        />

        <Route
          path="/Billing_status_tracking"
          element={
            <Sidebar>
              <Order_Status_Tracking mode="billing" />
            </Sidebar>}
        />

         <Route
          path="/Daily_Report"
          element={
            <Sidebar>
              <Daily_Report />
            </Sidebar>}
        />

         <Route
          path="/PersonWise_Report"
          element={
            <Sidebar>
              <PersonWise_Report />
            </Sidebar>}
        />

        <Route
          path="/Sales_Report"
          element={
            <Sidebar>
              <Sales_Report />
            </Sidebar>}
        />

        <Route
          path="/Order_Tracking"
          element={
            <Sidebar>
              <Order_Tracking />
            </Sidebar>}
        />

        <Route
          path="/Party_Assignment"
          element={
            <Sidebar>
              <Party_Assignment />
            </Sidebar>}
        />

           <Route
          path="/Party_Product_Assignment"
          element={
            <Sidebar>
              <Party_Product_Assignment />
            </Sidebar>}
        />

        <Route
          path="/NewInvoice"
          element={
            <Sidebar>
              <NewInvoice />
            </Sidebar>}
        />

        <Route
          path="/Add_Scheme"
          element={
            <Sidebar>
              <Add_Scheme />
            </Sidebar>}
        />

       </Routes>
    </BrowserRouter>
  );
}

export default App;
