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
      domains: ['virtual-pay.io', 'virtualpay.io'],
      keywords: ['virtual pay', 'virtualpay', 'onboarding', 'merchant account']
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

    const fromEmail = email.from?.address?.toLowerCase() || '';
    const toEmails = (email.to || []).map(t => t.address?.toLowerCase() || '').join(' ');
    const ccEmails = (email.cc || []).map(c => c.address?.toLowerCase() || '').join(' ');
    const subject = (email.subject || '').toLowerCase();
    const text = (email.text || '').toLowerCase();
    const html = (email.html || '').toLowerCase();
    
    const allContent = `${fromEmail} ${toEmails} ${ccEmails} ${subject} ${text} ${html}`;

    // Check each gateway
    for (const [gatewayId, config] of Object.entries(this.gateways)) {
      // Skip if merchant is not monitoring this gateway
      if (selectedGateways.length > 0 && !selectedGateways.includes(gatewayId)) {
        continue;
      }

      // Check domain in from/to/cc
      const domainMatch = config.domains.some(domain => 
        allContent.includes(domain)
      );

      if (domainMatch) {
        // Also check if it's onboarding related
        if (this.isOnboardingEmail(allContent)) {
          return gatewayId;
        }
      }

      // Check keywords (at least 2 matches)
      const keywordMatches = config.keywords.filter(keyword => 
        allContent.includes(keyword.toLowerCase())
      ).length;

      if (keywordMatches >= 2 && this.isOnboardingEmail(allContent)) {
        return gatewayId;
      }
    }

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

    // At least 2 onboarding keywords required
    return matches >= 2;
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
      virtualpay: 'Virtual Pay'
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
    return email.from?.address || '';
  }

  /**
   * Extract vendor name from email object
   * @param {Object} email
   * @returns {String}
   */
  static extractVendorName(email) {
    return email.from?.name || email.from?.address || 'Unknown';
  }
}

export default GatewayDetector;