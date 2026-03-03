import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Route, Switch } from 'wouter';
import App from './App.tsx';
import SkeletonEditorPage from './pages/skeleton-editor';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Switch>
      <Route path="/skeleton" component={SkeletonEditorPage} />
      <Route component={App} />
    </Switch>
  </StrictMode>,
);
