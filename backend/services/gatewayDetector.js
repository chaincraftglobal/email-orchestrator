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

  static detectGateway(email, selectedGateways = []) {
    if (!email) return null;

    const fromEmail = (email.from?.address || email.from_email || '').toLowerCase();
    const subject = (email.subject || '').toLowerCase();
    const text = (email.text || email.body_text || '').toLowerCase();
    const html = (email.html || email.body_html || '').toLowerCase();
    const allContent = `${fromEmail} ${subject} ${text} ${html}`;

    console.log(`🔍 Checking: "${subject.substring(0, 50)}..."`);

    // STEP 1: Exclude non-gateway domains
    const isExcluded = this.excludedDomains.some(domain => fromEmail.includes(domain));
    if (isExcluded) {
      console.log(`  ❌ EXCLUDED: From ${fromEmail.split('@')[1]}`);
      return null;
    }

    // STEP 2: Check negative keywords (instant reject)
    const negativeMatch = this.negativeKeywords.find(kw => allContent.includes(kw));
    if (negativeMatch) {
      console.log(`  ❌ REJECTED: Contains "${negativeMatch}"`);
      return null;
    }

    // STEP 3: Must contain specific onboarding phrase
    const hasOnboardingPhrase = this.onboardingPhrases.some(phrase => 
      allContent.includes(phrase)
    );

    if (!hasOnboardingPhrase) {
      console.log(`  ❌ REJECTED: No onboarding phrase found`);
      return null;
    }

    // STEP 4: Check each gateway
    for (const [gatewayId, config] of Object.entries(this.gateways)) {
      if (selectedGateways.length > 0 && !selectedGateways.includes(gatewayId)) {
        continue;
      }

      // Must have gateway name
      const hasGatewayName = allContent.includes(config.name);
      
      // Must have ALL required keywords
      const hasMustHave = config.mustHave.every(kw => allContent.includes(kw));

      console.log(`  ${gatewayId}: name=${hasGatewayName}, required=${hasMustHave}`);

      // REQUIRE: Gateway name + ALL mustHave keywords + onboarding phrase
      if (hasGatewayName && hasMustHave && hasOnboardingPhrase) {
        console.log(`  ✅ DETECTED: ${gatewayId}`);
        return gatewayId;
      }
    }

    console.log(`  ❌ Not a gateway onboarding email`);
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
