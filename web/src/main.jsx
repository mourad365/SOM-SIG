import './theme/tokens.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import App from './App.jsx';

// Register the useGSAP hook as a plugin once (recommended by @gsap/react).
gsap.registerPlugin(useGSAP);

createRoot(document.getElementById('root')).render(<App />);
