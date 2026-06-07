import json
import logging

logger = logging.getLogger(__name__)

# Active WebSocket connections for the SMS/Call simulator
simulator_connections = set()

# Active WebSocket connections for queue/live updates
queue_connections = set()

async def broadcast_to_simulator(message: dict):
    """
    Broadcasts a dictionary payload to all active simulator WebSocket connections.
    """
    if not simulator_connections:
        logger.debug("No active simulator connections to broadcast to.")
        return
        
    closed_connections = []
    payload = json.dumps(message)
    
    for client in list(simulator_connections):
        try:
            await client.send_text(payload)
        except Exception as e:
            logger.error(f"Error broadcasting to client: {e}")
            closed_connections.append(client)
            
    # Clean up closed connections
    for client in closed_connections:
        simulator_connections.discard(client)

async def broadcast_queue_update():
    """
    Broadcasts a refresh notification to all active queue display/dashboard WebSockets.
    """
    if not queue_connections:
        return
    payload = "REFRESH_QUEUE"
    closed = []
    for client in list(queue_connections):
        try:
            await client.send_text(payload)
        except Exception:
            closed.append(client)
    for c in closed:
        queue_connections.discard(c)

