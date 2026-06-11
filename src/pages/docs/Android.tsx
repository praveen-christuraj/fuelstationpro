import { useState } from 'react';
import { Smartphone, Folder, FileCode } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui/Card';
import CodeBlock from '../../components/CodeBlock';

const kotlinTree = `app/\n ├─ build.gradle.kts            # add supabase-kt + ktor\n └─ src/main/java/com/fuelflow/\n     ├─ MainActivity.kt\n     ├─ data/\n     │   ├─ SupabaseClient.kt     # singleton client\n     │   ├─ model/Sale.kt\n     │   └─ repo/SalesRepository.kt\n     ├─ ui/\n     │   ├─ dashboard/DashboardScreen.kt\n     │   ├─ sales/SalesScreen.kt\n     │   └─ theme/Theme.kt\n     └─ viewmodel/SalesViewModel.kt`;

const expoTree = `fuelflow-mobile/\n ├─ app.json\n ├─ App.tsx\n ├─ lib/supabase.ts            # shared client\n ├─ screens/\n │   ├─ DashboardScreen.tsx\n │   ├─ SalesScreen.tsx\n │   └─ LoginScreen.tsx\n ├─ components/KpiCard.tsx\n └─ navigation/AppNavigator.tsx`;

const kotlinClient = `// data/SupabaseClient.kt\nimport io.github.jan.supabase.createSupabaseClient\nimport io.github.jan.supabase.postgrest.Postgrest\nimport io.github.jan.supabase.gotrue.Auth\n\nval supabase = createSupabaseClient(\n    supabaseUrl = \"https://YOUR-PROJECT.supabase.co\",\n    supabaseKey = \"YOUR_ANON_KEY\"\n) {\n    install(Postgrest)\n    install(Auth)\n}`;

const kotlinRepo = `// repo/SalesRepository.kt\nimport io.github.jan.supabase.postgrest.postgrest\n\n@Serializable\ndata class Sale(\n    val id: Int? = null,\n    val sale_date: String,\n    val product_name: String,\n    val operator_name: String,\n    val shift_name: String,\n    val sale_volume: Double,\n    val total_amount: Double\n)\n\nclass SalesRepository {\n    suspend fun fetchSales(): List<Sale> =\n        supabase.postgrest[\"sales\"]\n            .select().decodeList<Sale>()\n\n    suspend fun addSale(sale: Sale) {\n        supabase.postgrest[\"sales\"].insert(sale)\n    }\n}`;

const kotlinScreen = `// ui/sales/SalesScreen.kt\n@Composable\nfun SalesScreen(vm: SalesViewModel = viewModel()) {\n    val sales by vm.sales.collectAsState()\n    LaunchedEffect(Unit) { vm.load() }\n\n    LazyColumn(Modifier.padding(16.dp)) {\n        items(sales) { s ->\n            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {\n                Column(Modifier.padding(12.dp)) {\n                    Text(s.product_name, fontWeight = FontWeight.Bold)\n                    Text(\"\${s.sale_volume} L  •  ₹\${s.total_amount}\")\n                    Text(\"\${s.operator_name} • \${s.shift_name}\",\n                         style = MaterialTheme.typography.bodySmall)\n                }\n            }\n        }\n    }\n}`;

const expoClient = `// lib/supabase.ts\nimport 'react-native-url-polyfill/auto';\nimport { createClient } from '@supabase/supabase-js';\nimport AsyncStorage from '@react-native-async-storage/async-storage';\n\nexport const supabase = createClient(\n  process.env.EXPO_PUBLIC_SUPABASE_URL!,\n  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,\n  { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true } }\n);`;

const expoScreen = `// screens/SalesScreen.tsx\nimport { useEffect, useState } from 'react';\nimport { View, Text, FlatList } from 'react-native';\nimport { supabase } from '../lib/supabase';\n\nexport default function SalesScreen() {\n  const [sales, setSales] = useState<any[]>([]);\n\n  useEffect(() => {\n    supabase.from('sales')\n      .select('*')\n      .order('sale_date', { ascending: false })\n      .then(({ data }) => setSales(data ?? []));\n  }, []);\n\n  return (\n    <FlatList\n      data={sales}\n      keyExtractor={(i) => String(i.id)}\n      renderItem={({ item }) => (\n        <View style={{ padding: 16, borderBottomWidth: 1, borderColor: '#eee' }}>\n          <Text style={{ fontWeight: '700' }}>{item.product_name}</Text>\n          <Text>{item.sale_volume} L  •  ₹{item.total_amount}</Text>\n          <Text style={{ color: '#888' }}>{item.operator_name} • {item.shift_name}</Text>\n        </View>\n      )}\n    />\n  );\n}`;

export default function Android() {
  const [tab, setTab] = useState<'kotlin' | 'expo'>('kotlin');
  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-bold text-slate-800">Android Guide</h1><p className="text-sm text-slate-400 mt-0.5">Copy-paste-ready references for native Kotlin & React Native Expo, sharing the same Supabase backend</p></div>
      <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
        <button onClick={() => setTab('kotlin')} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium ${tab === 'kotlin' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}><Smartphone className="w-4 h-4" /> Kotlin (Jetpack Compose)</button>
        <button onClick={() => setTab('expo')} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium ${tab === 'expo' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}><FileCode className="w-4 h-4" /> React Native (Expo)</button>
      </div>
      {tab === 'kotlin' ? (
        <div className="space-y-4">
          <Card><CardHeader title="Folder Structure" subtitle="Android Studio project layout" /><div className="p-5"><pre className="text-xs font-mono text-slate-600 bg-slate-50 rounded-lg p-4 overflow-x-auto">{kotlinTree}</pre></div></Card>
          <Card><CardHeader title="1. Supabase Client" /><div className="p-5"><CodeBlock filename="SupabaseClient.kt" code={kotlinClient} /></div></Card>
          <Card><CardHeader title="2. Repository & Model" /><div className="p-5"><CodeBlock filename="SalesRepository.kt" code={kotlinRepo} /></div></Card>
          <Card><CardHeader title="3. Compose Screen" /><div className="p-5"><CodeBlock filename="SalesScreen.kt" code={kotlinScreen} /></div></Card>
        </div>
      ) : (
        <div className="space-y-4">
          <Card><CardHeader title="Folder Structure" subtitle="Expo managed workflow" /><div className="p-5"><pre className="text-xs font-mono text-slate-600 bg-slate-50 rounded-lg p-4 overflow-x-auto">{expoTree}</pre></div></Card>
          <Card><CardHeader title="1. Shared Supabase Client" /><div className="p-5"><CodeBlock filename="lib/supabase.ts" code={expoClient} /></div></Card>
          <Card><CardHeader title="2. Sales Screen" /><div className="p-5"><CodeBlock filename="screens/SalesScreen.tsx" code={expoScreen} /></div></Card>
          <Card className="p-5 bg-blue-50 border-blue-100"><div className="flex items-start gap-2"><Folder className="w-4 h-4 text-blue-600 mt-0.5" /><p className="text-sm text-blue-700">Install deps: <code className="font-mono bg-white px-1.5 py-0.5 rounded">npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill</code></p></div></Card>
        </div>
      )}
    </div>
  );
}
