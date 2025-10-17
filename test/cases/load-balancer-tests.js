import { assert, assertErr, terminateAfter, startRegistry } from '../core/index.js'
import { createService, callService, Logger } from '../../src/index.js'

const logger = new Logger({
  // logGroup: 'loadBalancerTests',
  // includeLogLineNumbers: true,
  // warnLevel: true
})

// ============================================================================
// Round-Robin Load Balancing Tests
// ============================================================================

/**
 * Test basic round-robin load balancing with 2 instances
 */
async function testRoundRobinTwoInstances() {
  await terminateAfter(
    await startRegistry(),
    await createService('balancedService', () => ({ instance: 1 })),
    await createService('balancedService', () => ({ instance: 2 })),
    async () => {
      const results = []
      for (let i = 0; i < 10; i++) {
        results.push(await callService('balancedService', {}))
      }
      
      const instance1Count = results.filter(r => r.instance === 1).length
      const instance2Count = results.filter(r => r.instance === 2).length
      
      await assert([instance1Count, instance2Count],
        counts => counts[0] === 5,
        counts => counts[1] === 5,
        counts => counts[0] + counts[1] === 10
      )
    }
  )
}

/**
 * Test round-robin load balancing with 3 instances
 */
async function testRoundRobinThreeInstances() {
  await terminateAfter(
    await startRegistry(),
    await createService('tripleService', () => ({ instance: 'A' })),
    await createService('tripleService', () => ({ instance: 'B' })),
    await createService('tripleService', () => ({ instance: 'C' })),
    async () => {
      const results = []
      for (let i = 0; i < 15; i++) {
        results.push(await callService('tripleService', {}))
      }
      
      const countA = results.filter(r => r.instance === 'A').length
      const countB = results.filter(r => r.instance === 'B').length
      const countC = results.filter(r => r.instance === 'C').length
      
      await assert([countA, countB, countC],
        counts => counts[0] === 5,
        counts => counts[1] === 5,
        counts => counts[2] === 5
      )
    }
  )
}

/**
 * Test load balancing pattern sequence
 * Note: Round-robin starts with a random instance, so we verify alternating pattern
 */
async function testLoadBalancingSequence() {
  await terminateAfter(
    await startRegistry(),
    await createService('sequenceService', () => ({ id: 'first' })),
    await createService('sequenceService', () => ({ id: 'second' })),
    async () => {
      const results = []
      for (let i = 0; i < 6; i++) {
        results.push(await callService('sequenceService', {}))
      }
      
      // Verify alternating pattern (starting with either 'first' or 'second')
      const firstId = results[0].id
      const secondId = firstId === 'first' ? 'second' : 'first'
      
      await assert(results,
        r => r.length === 6,
        r => r[0].id === firstId,
        r => r[1].id === secondId,
        r => r[2].id === firstId,
        r => r[3].id === secondId,
        r => r[4].id === firstId,
        r => r[5].id === secondId
      )
    }
  )
}

// ============================================================================
// Instance Management Tests
// ============================================================================

/**
 * Test adding instance after initial registration
 */
async function testAddInstanceDynamically() {
  await terminateAfter(
    await startRegistry(),
    // Initially only 1 instance
    await createService('dynamicService', () => ({ instance: 1 })),
    async () => {
      let service2
      try {
        const result1 = await callService('dynamicService', {})
        await assert(result1, r => r.instance === 1)
        
        // Add second instance
        service2 = await createService('dynamicService', () => ({ instance: 2 }))
        
        // Now should load balance between both
        const results = []
        for (let i = 0; i < 10; i++) {
          results.push(await callService('dynamicService', {}))
        }
        
        const hasInstance1 = results.some(r => r.instance === 1)
        const hasInstance2 = results.some(r => r.instance === 2)
        
        await assert([hasInstance1, hasInstance2],
          flags => flags[0] === true,
          flags => flags[1] === true
        )
      } finally {
        if (service2) await service2.terminate()
      }
    }
  )
}

/**
 * Test removing instance during operation
 */
async function testRemoveInstanceDynamically() {
  await terminateAfter(
    await startRegistry(),
    async () => {
      const service1 = await createService('shrinkingService', () => ({ instance: 1 }))
      const service2 = await createService('shrinkingService', () => ({ instance: 2 }))
      // Initially 2 instances
      const results1 = []
      for (let i = 0; i < 4; i++) {
        results1.push(await callService('shrinkingService', {}))
      }
      
      const hasInstance1Before = results1.some(r => r.instance === 1)
      const hasInstance2Before = results1.some(r => r.instance === 2)
      
      await assert([hasInstance1Before, hasInstance2Before],
        flags => flags[0] === true,
        flags => flags[1] === true
      )
      
      // Remove instance 2
      await service2.terminate()
      
      // Wait a bit for unregistration to complete
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Now should only get instance 1
      const results2 = []
      for (let i = 0; i < 5; i++) {
        results2.push(await callService('shrinkingService', {}))
      }
      
      await assert(results2,
        r => r.every(result => result.instance === 1),
        r => r.length === 5
      )
      
      await service1.terminate()
    }
  )
}

/**
 * Test single instance (no load balancing needed)
 */
async function testSingleInstanceNoBalancing() {
  await terminateAfter(
    await startRegistry(),
    await createService('soloService', () => ({ solo: true, timestamp: Date.now() })),
    async () => {
      const results = []
      for (let i = 0; i < 5; i++) {
        results.push(await callService('soloService', {}))
      }
      
      await assert(results,
        r => r.length === 5,
        r => r.every(result => result.solo === true)
      )
    }
  )
}

// ============================================================================
// Load Balancing with Instance Failures
// ============================================================================

/**
 * Test load balancing when one instance throws error
 */
async function testLoadBalancingWithFailingInstance() {
  let callCount1 = 0
  let callCount2 = 0
  
  await terminateAfter(
    await startRegistry(),
    await createService('partialFailService', () => {
      callCount1++
      if (callCount1 % 2 === 0) {
        throw new Error('Instance 1 error')
      }
      return { instance: 1, call: callCount1 }
    }),
    await createService('partialFailService', () => {
      callCount2++
      return { instance: 2, call: callCount2 }
    }),
    async () => {
      const results = []
      const errors = []
      
      for (let i = 0; i < 10; i++) {
        try {
          results.push(await callService('partialFailService', {}))
        } catch (err) {
          errors.push(err)
        }
      }
      
      // Should have some successes and some errors
      await assert({ results, errors },
        data => data.results.length > 0,
        data => data.errors.length > 0,
        data => data.results.length + data.errors.length === 10
      )
    }
  )
}

/**
 * Test load balancing with slow instance
 */
async function testLoadBalancingWithSlowInstance() {
  await terminateAfter(
    await startRegistry(),
    await createService('slowService', async () => {
      await new Promise(resolve => setTimeout(resolve, 200))
      return { instance: 'slow', duration: 200 }
    }),
    await createService('slowService', () => {
      return { instance: 'fast', duration: 0 }
    }),
    async () => {
      const start = Date.now()
      const results = []
      
      // Make 4 calls - should alternate between slow and fast
      for (let i = 0; i < 4; i++) {
        results.push(await callService('slowService', {}))
      }
      
      const elapsed = Date.now() - start
      
      // Should have both slow and fast instances
      await assert(results,
        r => r.some(result => result.instance === 'slow'),
        r => r.some(result => result.instance === 'fast'),
        r => r.length === 4
      )
      
      // Total time should be ~400ms (2 slow calls at 200ms each)
      await assert(elapsed,
        e => e >= 380, // Allow some margin
        e => e <= 500  // But not too much
      )
    }
  )
}

// ============================================================================
// Load Balancing with Different Payloads
// ============================================================================

/**
 * Test load balancing preserves payload across instances
 */
async function testLoadBalancingPayloadPreservation() {
  await terminateAfter(
    await startRegistry(),
    await createService('payloadService', (payload) => ({ instance: 1, received: payload })),
    await createService('payloadService', (payload) => ({ instance: 2, received: payload })),
    async () => {
      const testPayloads = [
        { id: 1, data: 'first' },
        { id: 2, data: 'second' },
        { id: 3, data: 'third' },
        { id: 4, data: 'fourth' }
      ]
      
      const results = []
      for (const payload of testPayloads) {
        results.push(await callService('payloadService', payload))
      }
      
      await assert(results,
        r => r[0].received.id === 1 && r[0].received.data === 'first',
        r => r[1].received.id === 2 && r[1].received.data === 'second',
        r => r[2].received.id === 3 && r[2].received.data === 'third',
        r => r[3].received.id === 4 && r[3].received.data === 'fourth'
      )
    }
  )
}

/**
 * Test load balancing with binary payloads
 */
async function testLoadBalancingBinaryPayloads() {
  await terminateAfter(
    await startRegistry(),
    await createService('binaryService', (payload) => {
      return Buffer.concat([
        Buffer.from([1]), // Instance marker
        Buffer.isBuffer(payload) ? payload : Buffer.from([])
      ])
    }),
    await createService('binaryService', (payload) => {
      return Buffer.concat([
        Buffer.from([2]), // Instance marker
        Buffer.isBuffer(payload) ? payload : Buffer.from([])
      ])
    }),
    async () => {
      const testBuffer = Buffer.from([0xAA, 0xBB, 0xCC])
      const results = []
      
      for (let i = 0; i < 4; i++) {
        results.push(await callService('binaryService', testBuffer))
      }
      
      await assert(results,
        r => Buffer.isBuffer(r[0]),
        r => r[0][0] === 1 || r[0][0] === 2, // Instance 1 or 2
        r => r[0][1] === 0xAA && r[0][2] === 0xBB && r[0][3] === 0xCC,
        r => r.length === 4
      )
    }
  )
}

// ============================================================================
// High Load Tests
// ============================================================================

/**
 * Test load balancing under high concurrent load
 */
async function testHighConcurrentLoad() {
  await terminateAfter(
    await startRegistry(),
    await createService('highLoadService', () => ({ instance: 1 })),
    await createService('highLoadService', () => ({ instance: 2 })),
    await createService('highLoadService', () => ({ instance: 3 })),
    async () => {
      const promises = []
      for (let i = 0; i < 90; i++) {
        promises.push(callService('highLoadService', { id: i }))
      }
      
      const results = await Promise.all(promises)
      
      const count1 = results.filter(r => r.instance === 1).length
      const count2 = results.filter(r => r.instance === 2).length
      const count3 = results.filter(r => r.instance === 3).length
      
      await assert([count1, count2, count3],
        counts => counts[0] === 30,
        counts => counts[1] === 30,
        counts => counts[2] === 30,
        counts => counts[0] + counts[1] + counts[2] === 90
      )
    }
  )
}

/**
 * Test load balancing maintains distribution over time
 */
async function testLoadBalancingDistributionOverTime() {
  await terminateAfter(
    await startRegistry(),
    await createService('distributionService', () => ({ instance: 'A' })),
    await createService('distributionService', () => ({ instance: 'B' })),
    async () => {
      // Make calls in batches with delays
      const batch1 = []
      for (let i = 0; i < 10; i++) {
        batch1.push(await callService('distributionService', {}))
      }
      
      await new Promise(resolve => setTimeout(resolve, 50))
      
      const batch2 = []
      for (let i = 0; i < 10; i++) {
        batch2.push(await callService('distributionService', {}))
      }
      
      await new Promise(resolve => setTimeout(resolve, 50))
      
      const batch3 = []
      for (let i = 0; i < 10; i++) {
        batch3.push(await callService('distributionService', {}))
      }
      
      const allResults = [...batch1, ...batch2, ...batch3]
      const countA = allResults.filter(r => r.instance === 'A').length
      const countB = allResults.filter(r => r.instance === 'B').length
      
      await assert([countA, countB],
        counts => counts[0] === 15,
        counts => counts[1] === 15
      )
    }
  )
}

export default {
  testRoundRobinTwoInstances,
  testRoundRobinThreeInstances,
  testLoadBalancingSequence,
  testAddInstanceDynamically,
  testRemoveInstanceDynamically,
  testSingleInstanceNoBalancing,
  testLoadBalancingWithFailingInstance,
  testLoadBalancingWithSlowInstance,
  testLoadBalancingPayloadPreservation,
  testLoadBalancingBinaryPayloads,
  testHighConcurrentLoad,
  testLoadBalancingDistributionOverTime
}

