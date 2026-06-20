export const createExecutionSocket = (onMessage, onClose, onError, onOpen) => {
  // Use VITE_WS_URL if provided, otherwise construct from current location / API host
  let wsUrl = import.meta.env.VITE_WS_URL;
  
  if (!wsUrl) {
    const isProd = window.location.hostname !== 'localhost';
    if (isProd) {
      wsUrl = 'wss://codeshell-w7n4.onrender.com/ws/execute';
    } else {
      wsUrl = 'ws://localhost:8080/ws/execute';
    }
  }

  console.log('Connecting to WebSocket execution engine at:', wsUrl);
  const socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('WebSocket connection established.');
    if (onOpen) onOpen();
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e);
    }
  };

  socket.onclose = (event) => {
    console.log('WebSocket connection closed:', event.code, event.reason);
    if (onClose) onClose(event);
  };

  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
    if (onError) onError(error);
  };

  return {
    send: (msg) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(msg));
      } else {
        console.warn('Cannot send message, WebSocket is not open.');
      }
    },
    close: () => {
      socket.close();
    }
  };
};
