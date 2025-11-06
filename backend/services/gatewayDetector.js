class GatewayDetector {
  
  // Gateway keywords (expanded for better detection)
  static gateways = {
    razorpay: {
      keywords: [
        'razorpay', 'razor pay', 'rzp',
        'merchant id', 'live key', 'test key', 
        'razorpay account', 'razorpay integration',
        'razorpay dashboard'
      ]
    },
    payu: {
      keywords: [
        'payu', 'pay u', 'payumoney',
        'merchant key', 'payu account', 
        'payu integration', 'payu business'
      ]
    },
    cashfree: {
      keywords: [
        'cashfree', 'cash free',
        'cashfree payments', 'merchant dashboard',
        'cashfree integration'
      ]
    },
    paytm: {
      keywords: [
        'paytm', 'paytm payments',
        'merchant id', 'paytm business',
        'paytm integration', 'paytm account'
      ]
    },
    virtualpay: {
      keywords: [
        'virtual pay', 'virtualpay', 'virtual-pay',
        'onboarding', 'merchant account',
        'virtual pay solutions'
      ]
    }
  };

  // Onboarding keywords
  static onboardingKeywords = [
    'onboarding', 'onboard',
    'merchant', 'merchant id', 'merchant account',
    'kyc', 'kyc documents',
    'verification', 'document verification',
    'documents required', 'documents needed',
    'integration', 'api integration',
    'activation', 'account activation',
    'go live', 'golive',
    'credentials', 'api credentials',
    'api key', 'api keys', 'api secret',
    'settlement', 'settlement account',
    'compliance', 'compliance team',
    'agreement', 'merchant agreement',
    'payment gateway'
  ];

  /**
   * Detect gateway from email (CONTENT-ONLY, NO DOMAIN CHECK)
   * @param {Object} email - Email object
   * @param {Array} selectedGateways - Array of gateway IDs merchant is monitoring
   * @returns {String|null} - Gateway ID or null
   */
  static detectGateway(email, selectedGateways = []) {
    if (!email) return null;

    // Extract content (NO domain checking)
    const subject = (email.subject || '').toLowerCase();
    const text = (email.text || email.body_text || '').toLowerCase();
    const html = (email.html || email.body_html || '').toLowerCase();
    
    // Combine all text content
    const allContent = `${subject} ${text} ${html}`;

    console.log(`🔍 Detecting gateway for: "${subject.substring(0, 60)}..."`);

    // Check attachments for logo images
    const hasAttachments = email.attachments && email.attachments.length > 0;
    const attachmentNames = hasAttachments 
      ? email.attachments.map(a => (a.filename || '').toLowerCase()).join(' ')
      : '';

    console.log(`📎 Attachments: ${hasAttachments ? attachmentNames : 'none'}`);

    // Score each gateway based on content ONLY
    let bestMatch = null;
    let bestScore = 0;

    for (const [gatewayId, config] of Object.entries(this.gateways)) {
      // Skip if merchant is not monitoring this gateway
      if (selectedGateways.length > 0 && !selectedGateways.includes(gatewayId)) {
        continue;
      }

      let gatewayScore = 0;

      // Check keywords in subject (3 points each)
      const subjectMatches = config.keywords.filter(keyword => 
        subject.includes(keyword.toLowerCase())
      );
      gatewayScore += subjectMatches.length * 3;

      // Check keywords in body (2 points each)
      const bodyMatches = config.keywords.filter(keyword => 
        text.includes(keyword.toLowerCase()) || html.includes(keyword.toLowerCase())
      );
      gatewayScore += bodyMatches.length * 2;

      // Check keywords in attachments (2 points each)
      const attachmentMatches = config.keywords.filter(keyword => 
        attachmentNames.includes(keyword.toLowerCase())
      );
      gatewayScore += attachmentMatches.length * 2;

      // Check for logo/signature in HTML (check for common patterns)
      if (html.includes(`${gatewayId}`) || html.includes(`logo`) || html.includes(`signature`)) {
        gatewayScore += 1;
      }

      // Count onboarding keywords
      const onboardingMatches = this.onboardingKeywords.filter(keyword => 
        allContent.includes(keyword)
      ).length;

      console.log(`  📊 ${gatewayId}:`);
      console.log(`     - Subject matches: ${subjectMatches.length} (${subjectMatches.slice(0, 3).join(', ')})`);
      console.log(`     - Body matches: ${bodyMatches.length}`);
      console.log(`     - Attachment matches: ${attachmentMatches.length}`);
      console.log(`     - Onboarding keywords: ${onboardingMatches}`);
      console.log(`     - Total score: ${gatewayScore}`);

      // Need at least 3 points + 1 onboarding keyword
      if (gatewayScore >= 3 && onboardingMatches >= 1) {
        if (gatewayScore > bestScore) {
          bestScore = gatewayScore;
          bestMatch = gatewayId;
        }
      }
    }

    if (bestMatch) {
      console.log(`  ✅ DETECTED: ${bestMatch} (score: ${bestScore})`);
      return bestMatch;
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
    
    // Count onboarding keywords
    const matches = this.onboardingKeywords.filter(keyword => 
      lowerContent.includes(keyword)
    ).length;

    // At least 1 onboarding keyword required
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
