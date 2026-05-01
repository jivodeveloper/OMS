import { useState } from "react";
import Status from "./Status";
import Products from "./Products";
import Parties from "./Parties";
import Addresses from "./Addresses";
import Branches from "./Branches";
import Logs from "./Logs";
import "../styles/Sap_Sync.css";

export default function Sap_sync() {
  const [activeTab, setActiveTab] = useState("Status");

  const renderContent = () => {
    switch (activeTab) {
      case "Status":
        return <Status />;
      case "Products":
        return <Products />;
      case "Parties":
        return <Parties />;
      case "Addresses":
        return <Addresses />;
      case "Branches":
        return <Branches />;
      case "Logs":
        return <Logs />;
      default:
        return null;
    }
  };

  return (
    <div className="sap-page app-page">

      {/* ── TABS ── */}
      <div className="sap-tabs">
        {["Status", "Products", "Parties", "Addresses", "Branches", "Logs"].map((tab) => (
          <button
            key={tab}
            className={`sap-tab ${activeTab === tab ? "sap-tab-active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── CONTENT ── */}
      <div className="sap-content" style={{ marginTop: "24px" }}>{renderContent()}</div>
    </div>
  );
}
