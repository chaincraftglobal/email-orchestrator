class GatewayDetector {
  
  // Excluded domains (non-gateway services)
  static excludedDomains = [
    'relume.io', 'perplexity.ai', 'mail.perplexity.ai',
    'gmail.com', 'outlook.com', 'yahoo.com',
    'mailchimp.com', 'sendgrid.net', 'customer.io',
    'intercom.io', 'hubspot.com', 'salesforce.com',
    'make.com', 'zapier.com', 'notion.so',
    'slack.com', 'atlassian.net', 'asana.com'
  ];

  // Negative keywords (instant disqualification)
  static negativeKeywords = [
    'failed transaction',
    'transaction alert',
    'payment failed',
    'payment declined',
    'chargeback',
    'refund processed',
    'unsubscribe',
    'design tool',
    'free trial',
    'browse at the speed',
    'automation tool',
    'what will you automate'
  ];
  
  static gateways = {
    razorpay: {
      name: 'razorpay',
      mustHave: ['merchant', 'onboarding']  // MUST have both
    },
    payu: {
      name: 'payu',
      mustHave: ['merchant', 'onboarding']
    },
    cashfree: {
      name: 'cashfree',
      mustHave: ['merchant', 'onboarding']
    },
    paytm: {
      name: 'paytm',
      mustHave: ['merchant', 'onboarding']
    },
    virtualpay: {
      name: 'virtualpay',
      mustHave: ['merchant', 'onboarding']
    }
  };

  // ONLY these specific onboarding phrases
  static onboardingPhrases = [
    'merchant onboarding',
    'merchant account activation',
    'merchant id',
    'kyc documents required',
    'kyc verification',
    'api credentials',
    'test credentials',
    'live credentials',
    'go live',
    'golive',
    'integration documents',
    'merchant agreement',
    'onboarding documents',
    'account activation'
  ];

 static detectGateway(email, selectedGateways) {
  const subject = (email.subject || '').toLowerCase();
  const from = (email.from?.address || email.from || '').toLowerCase();
  const body = (email.text || '').toLowerCase();
  const combined = `${subject} ${from} ${body}`;
  
  console.log(`🔍 Checking: "${subject.substring(0, 50)}..."`);
  
  // FIRST: Check if it's a gateway email by keywords/domains
  // This must happen BEFORE exclusion checks!
  
  // VirtualPay detection
  if (selectedGateways.includes('virtualpay')) {
    if (combined.includes('virtualpay') || 
        combined.includes('virtual pay') ||
        from.includes('virtualpay') ||
        from.includes('crmsoftware') || // Test email sender
        combined.includes('jibun') ||
        combined.includes('merchant onboarding') && combined.includes('virtual')) {
      console.log('  ✅ Detected: VirtualPay');
      return 'virtualpay';
    }
  }
  
  // Razorpay detection
  if (selectedGateways.includes('razorpay')) {
    if (combined.includes('razorpay') || 
        from.includes('razorpay.com')) {
      console.log('  ✅ Detected: Razorpay');
      return 'razorpay';
    }
  }
  
  // PayU detection
  if (selectedGateways.includes('payu')) {
    if (combined.includes('payu') || 
        combined.includes('pay u') ||
        from.includes('payu.in')) {
      console.log('  ✅ Detected: PayU');
      return 'payu';
    }
  }
  
  // Cashfree detection
  if (selectedGateways.includes('cashfree')) {
    if (combined.includes('cashfree') || 
        from.includes('cashfree.com')) {
      console.log('  ✅ Detected: Cashfree');
      return 'cashfree';
    }
  }
  
  // Paytm detection
  if (selectedGateways.includes('paytm')) {
    if (combined.includes('paytm') || 
        from.includes('paytm.com')) {
      console.log('  ✅ Detected: Paytm');
      return 'paytm';
    }
  }
  
  // NOW: Apply exclusion rules only if no gateway was detected
  
  // Exclude personal/non-business gmail if no gateway keywords found
  if (from.includes('gmail.com')) {
    // Allow if it contains gateway-related keywords
    const hasGatewayKeywords = 
      combined.includes('payment gateway') ||
      combined.includes('merchant') ||
      combined.includes('onboarding') ||
      combined.includes('kyc') ||
      combined.includes('compliance') ||
      combined.includes('integration') ||
      combined.includes('api key') ||
      combined.includes('merchant id');
    
    if (!hasGatewayKeywords) {
      console.log('  ❌ EXCLUDED: From gmail.com (no gateway keywords)');
      return null;
    }
  }
  
  // Exclude newsletters/marketing
  if (combined.includes('unsubscribe')) {
    console.log('  ❌ REJECTED: Contains "unsubscribe"');
    return null;
  }
  
  // Check for onboarding keywords
  const hasOnboardingKeywords = 
    combined.includes('onboarding') ||
    combined.includes('merchant account') ||
    combined.includes('kyc') ||
    combined.includes('compliance') ||
    combined.includes('verification') ||
    combined.includes('documents required') ||
    combined.includes('merchant id') ||
    combined.includes('api key') ||
    combined.includes('integration') ||
    combined.includes('payment gateway');
  
  if (!hasOnboardingKeywords) {
    console.log('  ❌ REJECTED: No onboarding phrase found');
    return null;
  }
  
  // If we get here, it has onboarding keywords but no specific gateway detected
  console.log('  ⚠️ Has onboarding keywords but no gateway detected');
  return null;
}

  static isOnboardingEmail(content) {
    const lowerContent = content.toLowerCase();
    return this.onboardingPhrases.some(phrase => lowerContent.includes(phrase));
  }

  static getGatewayName(gatewayId) {
    const names = {
      razorpay: 'Razorpay',
      payu: 'PayU',
      cashfree: 'Cashfree',
      paytm: 'Paytm',
      virtualpay: 'VirtualPay'
    };
    return names[gatewayId] || gatewayId;
  }

  static extractVendorEmail(email) {
    return email.from?.address || email.from_email || '';
  }

  static extractVendorName(email) {
    return email.from?.name || email.from_name || email.from?.address || email.from_email || 'Unknown';
  }
}

export default GatewayDetector;
