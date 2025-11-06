class GatewayDetector {
  
  // Gateway domains and keywords
  static gateways = {
    razorpay: {
      domains: ['razorpay.com', 'rzp.io'],
      keywords: ['razorpay', 'merchant id', 'live key', 'test key', 'razorpay account']
    },
    payu: {
      domains: ['payu.in', 'payumoney.com'],
      keywords: ['payu', 'merchant key', 'payu account', 'payumoney']
    },
    cashfree: {
      domains: ['cashfree.com', 'cashfree.io'],
      keywords: ['cashfree', 'cashfree payments', 'merchant dashboard']
    },
    paytm: {
      domains: ['paytm.com', 'paytmbank.com'],
      keywords: ['paytm', 'merchant id', 'paytm payments', 'paytm business']
    },
    virtualpay: {
      domains: ['virtual-pay.io', 'virtualpay.io', 'virtualpay.com'],
      keywords: ['virtual pay', 'virtualpay', 'virtual-pay', 'onboarding', 'merchant account']
    }
  };

  // Onboarding keywords (for filtering relevant emails)
  static onboardingKeywords = [
    'onboarding',
    'merchant',
    'account',
    'kyc',
    'verification',
    'documents',
    'integration',
    'activation',
    'go live',
    'credentials',
    'api key',
    'merchant id',
    'settlement',
    'compliance',
    'agreement',
    'terms and conditions',
    'board resolution',
    'nda',
    'non-disclosure',
    'payment gateway'
  ];

  /**
   * Detect gateway from email
   * @param {Object} email - Email object with from, to, subject, text, html
   * @param {Array} selectedGateways - Array of gateway IDs merchant is monitoring
   * @returns {String|null} - Gateway ID or null
   */
  static detectGateway(email, selectedGateways = []) {
    if (!email) return null;

    const fromEmail = email.from?.address?.toLowerCase() || email.from_email?.toLowerCase() || '';
    const toEmails = (email.to || []).map(t => t.address?.toLowerCase() || '').join(' ');
    const ccEmails = (email.cc || []).map(c => c.address?.toLowerCase() || '').join(' ');
    const subject = (email.subject || '').toLowerCase();
    const text = (email.text || email.body_text || '').toLowerCase();
    const html = (email.html || email.body_html || '').toLowerCase();
    
    const allContent = `${fromEmail} ${toEmails} ${ccEmails} ${subject} ${text} ${html}`;

    console.log(`🔍 Detecting gateway for email: "${subject.substring(0, 50)}..."`);
    console.log(`📧 From: ${fromEmail}`);

    // Check each gateway
    for (const [gatewayId, config] of Object.entries(this.gateways)) {
      // Skip if merchant is not monitoring this gateway
      if (selectedGateways.length > 0 && !selectedGateways.includes(gatewayId)) {
        continue;
      }

      let gatewayScore = 0;

      // Check domain in from/to/cc (HIGH confidence - 5 points)
      const domainMatch = config.domains.some(domain => 
        allContent.includes(domain)
      );
      if (domainMatch) {
        gatewayScore += 5;
        console.log(`  ✓ Domain match for ${gatewayId}: +5 points`);
      }

      // Check keywords (1 point each)
      const keywordMatches = config.keywords.filter(keyword => 
        allContent.includes(keyword.toLowerCase())
      );
      gatewayScore += keywordMatches.length;
      
      if (keywordMatches.length > 0) {
        console.log(`  ✓ ${keywordMatches.length} keyword matches for ${gatewayId}: ${keywordMatches.join(', ')}`);
      }

      // Check onboarding keywords
      const onboardingMatches = this.onboardingKeywords.filter(keyword => 
        allContent.includes(keyword)
      ).length;

      console.log(`  📊 ${gatewayId} - Gateway score: ${gatewayScore}, Onboarding keywords: ${onboardingMatches}`);

      // LENIENT DETECTION: Need just 2 gateway keywords + 1 onboarding keyword
      // OR domain match + 1 onboarding keyword
      if ((gatewayScore >= 2 && onboardingMatches >= 1) || (domainMatch && onboardingMatches >= 1)) {
        console.log(`  ✅ DETECTED as ${gatewayId}!`);
        return gatewayId;
      }
    }

    console.log(`  ❌ No gateway detected`);
    return null;
  }

  /**
   * Check if email is onboarding related
   * @param {String} content - Combined email content
   * @returns {Boolean}
   */
  static isOnboardingEmail(content) {
    const lowerContent = content.toLowerCase();
    
    // Count how many onboarding keywords are present
    const matches = this.onboardingKeywords.filter(keyword => 
      lowerContent.includes(keyword)
    ).length;

    // At least 1 onboarding keyword required (more lenient)
    return matches >= 1;
  }

  /**
   * Get gateway name from ID
   * @param {String} gatewayId
   * @returns {String}
   */
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

  /**
   * Extract vendor email from email object
   * @param {Object} email
   * @returns {String}
   */
  static extractVendorEmail(email) {
    // Assume vendor is the sender for inbound emails
    return email.from?.address || email.from_email || '';
  }

  /**
   * Extract vendor name from email object
   * @param {Object} email
   * @returns {String}
   */
  static extractVendorName(email) {
    return email.from?.name || email.from_name || email.from?.address || email.from_email || 'Unknown';
  }
}

export default GatewayDetector;
