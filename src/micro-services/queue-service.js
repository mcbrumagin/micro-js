/**
 * Queue Service (Stub)
 * HTTP-based in-memory message queue
 * 
 * TODO: Implement full queue functionality
 * - FIFO ordering
 * - Single consumer per message
 * - Message persistence options
 * - Dead letter queue
 * - Message acknowledgment
 */

import createService from '../micro-core/api/create-service.js'
import HttpError from '../micro-core/http-primitives/http-error.js'
import Logger from '../utils/logger.js'

const logger = new Logger({ logGroup: 'micro-services' })

/**
 * Create a queue service
 * 
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Queue service server
 * 
 * @example
 * const queueService = await createQueueService()
 * 
 * // Enqueue a message
 * await call('queueService', { action: 'enqueue', queue: 'emails', message: {...} })
 * 
 * // Dequeue a message
 * const message = await call('queueService', { action: 'dequeue', queue: 'emails' })
 */
export default async function createQueueService(options = {}) {
  // In-memory queue storage: queueName -> [messages]
  const queues = new Map()
  
  const server = await createService('queueService', async function queueService(payload) {
    const { action, queue, message } = payload || {}
    
    if (!action) {
      throw new HttpError(400, 'Missing required field: action')
    }
    
    if (!queue) {
      throw new HttpError(400, 'Missing required field: queue')
    }
    
    switch (action) {
      case 'enqueue':
        return enqueue(queue, message)
      
      case 'dequeue':
        return dequeue(queue)
      
      case 'peek':
        return peek(queue)
      
      case 'size':
        return size(queue)
      
      case 'clear':
        return clear(queue)
      
      case 'list':
        return listQueues()
      
      default:
        throw new HttpError(400, `Unknown action: ${action}`)
    }
  }, options)
  
  /**
   * Add a message to the end of a queue
   */
  function enqueue(queueName, message) {
    if (!queues.has(queueName)) {
      queues.set(queueName, [])
    }
    
    const queue = queues.get(queueName)
    const messageId = `${queueName}_${Date.now()}_${queue.length}`
    
    queue.push({
      id: messageId,
      data: message,
      enqueuedAt: Date.now()
    })
    
    logger.debug(`enqueue - queue: ${queueName}, size: ${queue.length}`)
    
    return { messageId, queueSize: queue.length }
  }
  
  /**
   * Remove and return the first message from a queue
   */
  function dequeue(queueName) {
    if (!queues.has(queueName)) {
      return { message: null, queueSize: 0 }
    }
    
    const queue = queues.get(queueName)
    const message = queue.shift()
    
    // Clean up empty queues
    if (queue.length === 0) {
      queues.delete(queueName)
    }
    
    logger.debug(`dequeue - queue: ${queueName}, remaining: ${queue.length}`)
    
    return {
      message: message || null,
      queueSize: queue.length
    }
  }
  
  /**
   * View the first message without removing it
   */
  function peek(queueName) {
    if (!queues.has(queueName)) {
      return { message: null, queueSize: 0 }
    }
    
    const queue = queues.get(queueName)
    return {
      message: queue[0] || null,
      queueSize: queue.length
    }
  }
  
  /**
   * Get the size of a queue
   */
  function size(queueName) {
    const queueSize = queues.has(queueName) ? queues.get(queueName).length : 0
    return { queue: queueName, size: queueSize }
  }
  
  /**
   * Clear all messages from a queue
   */
  function clear(queueName) {
    const existed = queues.has(queueName)
    if (existed) {
      queues.delete(queueName)
    }
    return { cleared: existed }
  }
  
  /**
   * List all queues
   */
  function listQueues() {
    const result = {}
    for (const [queueName, messages] of queues) {
      result[queueName] = {
        size: messages.length,
        oldestMessage: messages[0]?.enqueuedAt || null
      }
    }
    return result
  }
  
  return server
}

