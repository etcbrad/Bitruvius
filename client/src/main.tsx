 import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Route, Switch } from 'wouter';
import App from './App.tsx';
import SkeletonEditorPage from './pages/skeleton-editor';
import SkeletonSuitePage from './pages/skeleton-suite';
import PupptFkCreatorPage from './pages/puppyt-fk-creator';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Switch>
        <Route path="/skeleton" component={SkeletonEditorPage} />
        <Route path="/skeleton-suite" component={SkeletonSuitePage} />
        <Route path="/puppt-fk" component={PupptFkCreatorPage} />
        <Route path="/studio" component={App} />
        <Route path="/" component={App} />
        <Route component={App} />
      </Switch>
    </ErrorBoundary>
  </StrictMode>,
);
