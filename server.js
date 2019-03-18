/*** Import modules ***/
const isJSON      = require('is-valid-json'),
      WebSocket   = require('ws'),
      fileSystem  = require('fs');

/*** Import Configuration file ***/
let config = {
  path: './server.config.json'
};

// Load config file as JSON if it exists
if (fileSystem.existsSync(config.path)) {
  let configImport = fileSystem.readFileSync(config.path, 'utf8');

  // Check if config file is in a valid JSON format
  if (isJSON(configImport)) {
    config = JSON.parse(configImport);
  }

  // Output error to console if it isn't a valid JSON format
  else {
    console.error('Invalid JSON format in configuration file');
  }
}

/*** Declare constant variables ***/
const wsPort          = config.wsPort || 80,  // The port the WebSocket server listens on
      clients         = [],         // Array of Clients
      wsFunctions     = {},         // Object of server request functions
      wsFunctionsMap  = new Map();  // Map of server request functions

/*** General functions ***/

// Checks if input variable is declared and set
const isSet = variable => {
  return !(typeof variable === 'undefined' || variable === null);
};

// Initialization function
const init = () => {
  // Map server request functions
  Object.entries(wsFunctions).forEach(func => {
    wsFunctionsMap.set(func[0], func[1]);
  });

  // Start the WebSocket server
  startWSServer(WebSocket);
};

/*** Server functions ***/

// Start the WebSocket server
const startWSServer = webSocket => {
  console.info(`Starting WebSocket server on port ${wsPort}`);

  // Create the WebSocket server
  const wss = new webSocket.Server({
    port: wsPort,
  });

  // Handle WebSocket connection event
  wss.on('connection', wsConnection);
};

// Handle connection
const wsConnection = ws => {
  console.log('[WS] Connection');

  // Handle WebSocket client events
  ws.on('message', message => {
    let request = {
      content: message,
      client: ws
    };
    wsMessage(request);
  });

  // Handle disconnects
  ws.on('close', () => {
    wsClose(ws);
  });
};

// Handle requests from clients
const wsMessage = message => {
  console.log('[WS] Message Recieved:', message.content);

  // Validate JSON format from client
  if (isJSON(message.content)) {
    incomingMessage(message.client, JSON.parse(message.content));
  }

  // Send back an error if the request isn't a valid JSON format
  else {
    incomingMessageError(message.client, `Invalid JSON format`);
  }
};

// Handle client disconnect
const wsClose = client => {
  wsFunctions.leaveChat(client);
  console.log('[WS] Disconnected');
};

// Handle client request
const incomingMessage = (client, data) => {

  // Check if the action key is set
  if (!isSet(data.action)) {
    incomingMessageError(client, `action is missing`);
    return;
  }

  // Check if requested action exists
  if (!wsFunctionsMap.has(data.action)) {
    incomingMessageError(client, `No such action`);
    return;
  }

  // Run requested action
  wsFunctionsMap.get(data.action)(client, data);
};

// Send error back to client
const incomingMessageError = (client, error) => {
  client.send(JSON.stringify({
    error: error
  }));
};

// Broadcast to all clients
const broadcast = data => {

  // Check if there are any clients joined in the chat before broadcasting
  if (clients.length > 0) {
    clients.forEach((client, index) => {

      // Make a copy of the broadcast data for targeted client adaptions
      let dataInstance = JSON.parse(JSON.stringify(data));

      // Remove the client object from targeted broadcast data
      // We don't want to send the client object to the clients
      delete dataInstance.client;

      // Set a 'me' flag if the broadcast is triggered by this client
      if (data.client && Object.is(client, data.client)) {
        dataInstance.data.me = true;
      }

      // Make sure the client is still connected before sending the braodcast to it
      if (client.readyState === WebSocket.OPEN) {
        // Send the broadcast data to the client
        client.send(JSON.stringify(dataInstance));
      }

      // Remove the client from the client list if the connection is broken
      else {
        clients.splice(index, 1);
        console.warn('Found & deleted closed client on index', index);
      }
    });
  }
};

/*** Server request functions ***/

// Join client to the chat
wsFunctions.joinChat = (client, data) => {

  // Check if the client has already joined the chat
  if (clients.indexOf(client) != -1) {
    incomingMessageError(client, `Client already joined`);
    return;
  }

  // Check if the nickname is set
  if (!isSet(data.nickname)) {
    incomingMessageError(client, `nickname is missing`);
    return;
  }

  // Broadcast the joined client
  broadcast({
    action: 'clientJoin',
    nickname: data.nickname,
  });

  // Include the nickname in the client object
  client.nickname = data.nickname;
  // Add the client to the joined clients array
  clients.push(client);

  // Send a welcome to the joined client
  client.send(JSON.stringify({
    action: 'welcomeClient',
    nickname: data.nickname,
    message: `Welcome ${data.nickname}!`,
  }));
};

// Remove client from the chat
wsFunctions.leaveChat = (client) => {

  // Make sure the client array isn't empty
  if (clients.length > 0) {

    // Get the index of client object
    let index = clients.indexOf(client);

    // Remove client from chat if found
    if (index != -1) {
      // Save the nickname before removing
      let nickname = client.nickname;
      // Remove client from the chat
      clients.splice(index, 1);

      // Broadcast client leaving
      broadcast({
        action: 'clientLeave',
        nickname: nickname,
      });
    }
  }
};

// Handle incoming chat message
wsFunctions.sendChat = (client, data) => {

  // Check if a message exists
  if (!isSet(data.message)) {
    incomingMessageError(client, `message is missing`);
    return;
  }

  // Broadcast the chat message
  broadcast({
    client: client,
    action: 'incomingChat',
    data: {
      time: Date.now(),
      name: client.nickname,
      content: data.message,
    }
  });
};

// Handle client nickname change
wsFunctions.changeNickname = (client, data) => {

  // Check if nickname is set
  if (!isSet(data.nickname)) {
    incomingMessageError(client, `nickname is missing`);
    return;
  }

  // Save old nickname
  let oldNickname = client.nickname;
  // Set new nickname to client
  client.nickname = data.nickname;

  // Broadcast the nickname change
  broadcast({
    action: 'nicknameChange',
    oldNickname: oldNickname,
    newNickname: data.nickname,
  });
};

// Run Initialization
init();
