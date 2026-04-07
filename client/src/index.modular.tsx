// Modular entry point that adapts to build type
import React from 'react';
import ReactDOM from 'react-dom/client';
import ModularApp from './App.modular';
import './index.css';

// Get the root element
const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// Render the modular app
root.render(
  <React.StrictMode>
    <ModularApp />
  </React.StrictMode>
);
