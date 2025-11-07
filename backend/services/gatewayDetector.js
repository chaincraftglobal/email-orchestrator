class GatewayDetector {
  
  static gateways = {
    razorpay: {
      keywords: ['razorpay', 'rzp.io'],
      strongKeywords: ['razorpay merchant', 'razorpay account', 'razorpay kyc']
    },
    payu: {
      keywords: ['payu', 'payumoney'],
      strongKeywords: ['payu merchant', 'payu account', 'payu kyc']
    },
    cashfree: {
      keywords: ['cashfree'],
      strongKeywords: ['cashfree merchant', 'cashfree account', 'cashfree kyc']
    },
    paytm: {
      keywords: ['paytm payments', 'paytm business'],
      strongKeywords: ['paytm merchant', 'paytm kyc']
    },
    virtualpay: {
      keywords: ['virtualpay', 'virtual-pay', 'virtual pay'],
      strongKeywords: ['virtualpay merchant', 'virtualpay onboarding', 'virtual pay merchant']
    }
  };

  static onboardingKeywords = [
    'merchant account', 'merchant id', 'merchant onboarding',
    'kyc', 'kyc documents', 'kyc verification',
    'api key', 'api secret', 'api credentials',
    'payment gateway integration',
    'go live', 'golive', 'activation',
    'settlement account',
    'compliance documents'
  ];

  static detectGateway(email, selectedGateways = []) {
    if (!email) return null;

    const subject = (email.subject || '').toLowerCase();
    const text = (email.text || email.body_text || '').toLowerCase();
    const html = (email.html || email.body_html || '').toLowerCase();
    const allContent = `${subject} ${text} ${html}`;

    console.log(`🔍 Detecting: "${subject.substring(0, 50)}..."`);

    // STRICT DETECTION: Must have gateway name + onboarding keyword
    for (const [gatewayId, config] of Object.entries(this.gateways)) {
      if (selectedGateways.length > 0 && !selectedGateways.includes(gatewayId)) {
        continue;
      }

      // Check if gateway name appears
      const hasGatewayName = config.keywords.some(kw => allContent.includes(kw));
      
      if (!hasGatewayName) continue;

      // Check if has strong gateway keyword OR onboarding keyword
      const hasStrongKeyword = config.strongKeywords.some(kw => allContent.includes(kw));
      const hasOnboarding = this.onboardingKeywords.some(kw => allContent.includes(kw));

      console.log(`  ${gatewayId}: name=${hasGatewayName}, strong=${hasStrongKeyword}, onboard=${hasOnboarding}`);

      // REQUIRE: Gateway name + (strong keyword OR onboarding keyword)
      if (hasGatewayName && (hasStrongKeyword || hasOnboarding)) {
        console.log(`  ✅ DETECTED: ${gatewayId}`);
        return gatewayId;
      }
    }

    console.log(`  ❌ Not a gateway email`);
    return null;
  }

  static isOnboardingEmail(content) {
    const lowerContent = content.toLowerCase();
    return this.onboardingKeywords.some(kw => lowerContent.includes(kw));
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
