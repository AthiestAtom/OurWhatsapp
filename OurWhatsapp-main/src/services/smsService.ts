import twilio from 'twilio';

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

class SMSService {
  private client: twilio.Twilio;
  private config: TwilioConfig;

  constructor() {
    this.config = {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      fromNumber: process.env.TWILIO_PHONE_NUMBER || ''
    };

    if (!this.config.accountSid || !this.config.authToken || !this.config.fromNumber) {
      console.warn('⚠️  Twilio credentials not configured. Using mock SMS service.');
      this.client = null;
    } else {
      this.client = twilio(this.config.accountSid, this.config.authToken);
    }
  }

  async sendVerificationCode(phoneNumber: string, code: string): Promise<boolean> {
    try {
      if (!this.client) {
        // Fallback to mock service
        console.log(`📱 MOCK SMS: Verification code for ${phoneNumber}: ${code}`);
        return true;
      }

      const message = await this.client.messages.create({
        body: `Your OurWhatsApp verification code is: ${code}. Valid for 10 minutes.`,
        from: this.config.fromNumber,
        to: phoneNumber
      });

      console.log(`✅ SMS sent to ${phoneNumber}. SID: ${message.sid}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send SMS:', error);
      return false;
    }
  }

  async sendWelcomeMessage(phoneNumber: string, username: string): Promise<boolean> {
    try {
      if (!this.client) {
        console.log(`📱 MOCK SMS: Welcome message sent to ${phoneNumber}`);
        return true;
      }

      const message = await this.client.messages.create({
        body: `Welcome to OurWhatsApp, ${username}! Your account has been created successfully.`,
        from: this.config.fromNumber,
        to: phoneNumber
      });

      console.log(`✅ Welcome SMS sent to ${phoneNumber}. SID: ${message.sid}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send welcome SMS:', error);
      return false;
    }
  }
}

export const smsService = new SMSService();
