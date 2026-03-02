import React, { useState, useEffect } from 'react';
import { Activity, Server, Database, HardDrive, Cpu, AlertCircle } from 'lucide-react';

// Mock Component for Dashboard Card
const StatCard = ({ title, value, icon: Icon, color }) => (
  <div className="bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-700">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-slate-400 text-sm font-medium">{title}</p>
        <h3 className="text-2xl font-bold text-white mt-2">{value}</h3>
      </div>
      <div className={`p-3 rounded-full ${color} bg-opacity-20`}>
        <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
      </div>
    </div>
  </div>
);

function App() {
  const [stats, setStats] = useState({
    clusters: 2,
    nodes: 8,
    vms: 45,
    storage: "12.5 TB"
  });

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-slate-800 border-r border-slate-700">
        <div className="p-6">
          <h1 className="text-xl font-bold text-blue-400 flex items-center gap-2">
            <Server className="w-6 h-6" />
            NEXUS
          </h1>
        </div>
        <nav className="mt-6 px-4">
          <a href="#" className="flex items-center gap-3 px-4 py-3 bg-slate-700 rounded-lg text-white mb-2">
            <Activity className="w-5 h-5" /> Dashboard
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors mb-2">
            <Database className="w-5 h-5" /> Clusters
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors mb-2">
            <HardDrive className="w-5 h-5" /> Storage
          </a>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-8">
        <header className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold">Dashboard Overview</h2>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 text-green-400 bg-green-900/30 px-3 py-1 rounded-full text-sm">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
              System Healthy
            </span>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard title="Active Clusters" value={stats.clusters} icon={Server} color="bg-blue-500" />
          <StatCard title="Online Nodes" value={stats.nodes} icon={Database} color="bg-green-500" />
          <StatCard title="Running VMs" value={stats.vms} icon={Cpu} color="bg-purple-500" />
          <StatCard title="Total Storage" value={stats.storage} icon={HardDrive} color="bg-orange-500" />
        </div>

        {/* Recent Alerts (Mock) */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            Recent Alerts
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-900 rounded border border-slate-700 border-l-4 border-l-yellow-500">
              <div>
                <p className="font-medium text-white">High CPU Usage</p>
                <p className="text-sm text-slate-400">Node 'pve-01' exceeded 90% load</p>
              </div>
              <span className="text-sm text-slate-500">2 mins ago</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-900 rounded border border-slate-700 border-l-4 border-l-red-500">
              <div>
                <p className="font-medium text-white">Backup Failed</p>
                <p className="text-sm text-slate-400">VM 103 backup job failed: input/output error</p>
              </div>
              <span className="text-sm text-slate-500">1 hour ago</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
