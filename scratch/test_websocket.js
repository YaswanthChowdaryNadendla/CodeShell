const WebSocket = require('ws');

const socket = new WebSocket('ws://localhost:8080/ws/execute');

socket.on('open', () => {
  console.log('[CLIENT] Connected to execution WebSocket');
  const runMessage = {
    type: 'run',
    language: 'python',
    code: 'print("Hello World from Python test!")\n',
    preloadedInput: ''
  };
  socket.send(JSON.stringify(runMessage));
  console.log('[CLIENT] Sent run message');
});

socket.on('message', (data) => {
  console.log('[CLIENT] Received message:', data.toString());
  const parsed = JSON.parse(data.toString());
  if (parsed.type === 'exit') {
    console.log('[CLIENT] Process exited, closing connection');
    socket.close();
  }
});

socket.on('close', () => {
  console.log('[CLIENT] Connection closed');
});

socket.on('error', (err) => {
  console.error('[CLIENT] WebSocket Error:', err);
});
