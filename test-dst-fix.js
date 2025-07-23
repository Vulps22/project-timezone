// Quick test to see if DST service can start without the SyntaxError
const dstService = require('./services/dstService');

console.log('🧪 Testing DST service fix...');

// Test creating the service
try {
    console.log('✅ DST service imported successfully');
    
    // Test the service status
    const status = dstService.getStatus();
    console.log('📊 Service status:', status);
    
    console.log('🎉 DST service appears to be working!');
} catch (error) {
    console.error('❌ DST service test failed:', error);
}
