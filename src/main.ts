/**
 * Spec Doctor - Main Application Entry Point
 *
 * Initializes the application UI when the DOM is ready.
 */

import { initializeApp } from './ui';

// Initialize the app when the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeApp('root');
  });
} else {
  initializeApp('root');
}
