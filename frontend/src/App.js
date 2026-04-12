import React from 'react';

function App() {
  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'Arial, sans-serif',
      textAlign: 'center',
      backgroundColor: '#25D366',
      color: 'white',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <h1>OurWhatsApp Clone</h1>
      <p>WhatsApp Clone is working!</p>
      <div style={{ 
        backgroundColor: 'white', 
        color: '#333', 
        padding: '20px', 
        borderRadius: '10px',
        marginTop: '20px',
        maxWidth: '400px'
      }}>
        <h3>Status: Working</h3>
        <p>React app loaded successfully!</p>
        <p>Next: Add Firebase secrets for SMS functionality</p>
      </div>
    </div>
  );
}

export default App;
