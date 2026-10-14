import FormulaBar from './components/spreadsheet/FormulaBar';
import Grid from './components/spreadsheet/Grid';
import StatusBar from './components/spreadsheet/StatusBar';
import Header from './components/layout/Header';
import Toolbar from './components/toolbar/Toolbar';
import { useGridKeyboard } from './hooks/useGridKeyboard';

export default function App() {
  useGridKeyboard();

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <Header />
      <Toolbar />
      <FormulaBar />
      <Grid />
      <StatusBar />
    </div>
  );
}
