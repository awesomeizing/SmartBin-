import { useState } from 'react';
import { useDatabase } from '@/contexts/DatabaseContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { formatDate } from '@/lib/formatters';
import { FileBarChart, Download, FileText, Table2, FileSpreadsheet } from 'lucide-react';
import { useToast } from '@/contexts/NotificationContext';

const reportTypes = [
  { id: 'collection', label: 'Collection Report', icon: FileText, description: 'Detailed collection history with timestamps, volumes, and efficiency metrics.' },
  { id: 'analytics', label: 'Analytics Report', icon: FileBarChart, description: 'Comprehensive analytics including fill levels, trends, and zone comparisons.' },
  { id: 'bins', label: 'Bin Status Report', icon: Table2, description: 'Current status of all deployed bins including health, battery, and fill levels.' },
  { id: 'trucks', label: 'Fleet Report', icon: FileSpreadsheet, description: 'Vehicle utilization, fuel consumption, and route efficiency data.' },
];

const formatOptions = [
  { value: 'csv', label: 'CSV' },
  { value: 'pdf', label: 'PDF' },
  { value: 'xlsx', label: 'Excel (XLSX)' },
];

const periodOptions = [
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
  { value: 'year', label: 'This Year' },
];

export function Reports() {
  const { binSummaries, collections, trucks, dailyAnalytics } = useDatabase();
  const { addToast } = useToast();
  const [selectedFormat, setSelectedFormat] = useState('csv');
  const [selectedPeriod, setSelectedPeriod] = useState('30d');

  const handleExport = (reportType: string) => {
    // Generate CSV data based on report type
    let csvContent = '';
    let filename = '';

    switch (reportType) {
      case 'bins': {
        csvContent = 'Bin ID,Label,Zone,Fill Level (%),Battery (%),Status,Health Score,Last Update\n';
        csvContent += binSummaries.map(b =>
          `${b.id},${b.label},${b.zone},${b.fillPct},${b.batteryPct ?? ''},${b.binStatus},${b.healthScore ?? ''},${formatDate(b.lastUpdate)}`
        ).join('\n');
        filename = `smartbin_bins_${formatDate(Date.now(), 'yyyy-MM-dd')}`;
        break;
      }
      case 'collection': {
        csvContent = 'ID,Bin,Zone,Truck,Driver,Fill Before (%),Fill After (%),Waste (kg),Date\n';
        csvContent += collections.map(c =>
          `${c.id},${c.binLabel},${c.zone},${c.truckLabel},${c.driverName},${c.fillLevelBefore},${c.fillLevelAfter},${c.wasteKg},${formatDate(c.collectedAt)}`
        ).join('\n');
        filename = `smartbin_collections_${formatDate(Date.now(), 'yyyy-MM-dd')}`;
        break;
      }
      case 'analytics': {
        csvContent = 'Date,Collections,Waste (kg),Avg Fill (%),Overflow Count,Efficiency (%),CO₂ Saved (kg)\n';
        csvContent += dailyAnalytics.map(d =>
          `${d.date},${d.totalCollections},${d.totalWasteKg},${d.avgFillPct},${d.overflowCount},${d.efficiency},${d.co2SavedKg}`
        ).join('\n');
        filename = `smartbin_analytics_${formatDate(Date.now(), 'yyyy-MM-dd')}`;
        break;
      }
      case 'trucks': {
        csvContent = 'Truck ID,Label,Plate,Status,Driver,Fuel (%),Collections Today,Distance (km)\n';
        csvContent += trucks.map(t =>
          `${t.id},${t.label},${t.plateNumber},${t.status},${t.driver?.name ?? 'N/A'},${t.fuelLevelPct},${t.todayCollections},${t.totalKmToday}`
        ).join('\n');
        filename = `smartbin_fleet_${formatDate(Date.now(), 'yyyy-MM-dd')}`;
        break;
      }
    }

    if (selectedFormat === 'csv' || selectedFormat === 'xlsx') {
      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } else {
      // PDF — use print
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html><head><title>${filename}</title>
          <style>body{font-family:monospace;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}th{background:#f0f0f0}</style>
          </head><body>
          <h2>SmartBin+ — ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report</h2>
          <p>Generated: ${formatDate(Date.now(), 'MMMM d, yyyy HH:mm')}</p>
          <table>${csvContent.split('\n').map((row, i) => `<tr>${row.split(',').map(cell => i === 0 ? `<th>${cell}</th>` : `<td>${cell}</td>`).join('')}</tr>`).join('')}</table>
          </body></html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    }

    addToast({ title: 'Report exported', message: `${reportType} report downloaded as ${selectedFormat.toUpperCase()}.`, severity: 'info' });
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/[0.05] pb-6">
        <div>
          <h1 className="text-2xl font-display font-medium tracking-tight">Reports</h1>
          <p className="text-zinc-500 text-sm mt-1">Generate and export operational reports.</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="w-48">
          <Select options={formatOptions} value={selectedFormat} onChange={setSelectedFormat} label="Format" />
        </div>
        <div className="w-48">
          <Select options={periodOptions} value={selectedPeriod} onChange={setSelectedPeriod} label="Period" />
        </div>
      </div>

      {/* Report Types Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reportTypes.map(report => (
          <Card key={report.id} className="bg-white/[0.01] border-white/[0.05] hover:bg-white/[0.02] transition-colors group">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center shrink-0 group-hover:bg-white/[0.06] transition-colors">
                  <report.icon className="w-5 h-5 text-zinc-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-white mb-1">{report.label}</h3>
                  <p className="text-xs text-zinc-500 leading-relaxed mb-4">{report.description}</p>
                  <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleExport(report.id)}>
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Export {selectedFormat.toUpperCase()}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
