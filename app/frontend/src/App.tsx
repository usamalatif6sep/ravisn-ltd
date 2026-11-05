import { useEffect, useState } from "react";
import ChatsPage from "./ChatsPage";
import OrdersPage from "./OrdersPage";
import { startStorePolling } from "./storeSummary";
import CataloguePage from "./catalogue/CataloguePage";
import CommandPalette from "./CommandPalette";
import ExportsPage from "./ExportsPage";
import ImagesPage from "./ImagesPage";
import ReviewPage from "./ReviewPage";
import SettingsPage from "./SettingsPage";
import Sidebar from "./Sidebar";
import SuppliersPage from "./SuppliersPage";
import WebsitePage from "./WebsitePage";
import { useApp } from "./store";
import { Empty, Spinner, useToast } from "./ui";

export default function App() {
  const { meta, route, online } = useApp();
  const [palette, setPalette] = useState(false);
  const toast = useToast();
  useEffect(() => {
    if (meta?.imported) startStorePolling((text, open) => toast({ text, action: { label: "Open", run: open } }));
  }, [meta?.imported, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!meta) {
    return <div className="boot">{online ? <Spinner /> : <Empty title="Ravisn is not running">Open it again from the desktop shortcut.</Empty>}</div>;
  }

  return (
    <div className="app">
      <Sidebar onSearch={() => setPalette(true)} />
      <main className="main">
        {!online && <div className="offline-banner">Ravisn has stopped. Open it again from the desktop shortcut, then reload this window.</div>}
        {!meta.imported ? (
          <Empty title="No data yet">The workbooks have not been imported. Start Ravisn from the desktop shortcut to import them.</Empty>
        ) : route.view === "catalogue" ? (
          <CataloguePage key={route.country} country={route.country} itemId={route.id} />
        ) : route.view === "suppliers" ? (
          <SuppliersPage id={route.id} />
        ) : route.view === "review" ? (
          <ReviewPage kind={route.kind} />
        ) : route.view === "exports" ? (
          <ExportsPage />
        ) : route.view === "images" ? (
          <ImagesPage />
        ) : route.view === "website" ? (
          <WebsitePage />
        ) : route.view === "orders" ? (
          <OrdersPage number={route.number} />
        ) : route.view === "chats" ? (
          <ChatsPage id={route.id} />
        ) : (
          <SettingsPage tab={route.tab} />
        )}
      </main>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
  );
}
