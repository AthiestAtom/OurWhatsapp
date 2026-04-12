import mongoose, { Schema } from 'mongoose';
import { IContact } from '@/types';

const contactItemSchema = new Schema({
  phoneNumber: {
    type: String,
    required: true,
    validate: {
      validator: function(phone: string) {
        return /^\+?[1-9]\d{1,14}$/.test(phone);
      },
      message: 'Invalid phone number format'
    }
  },
  displayName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const contactSchema = new Schema<IContact>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  contacts: [contactItemSchema]
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc: any, ret: any) {
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for better performance
contactSchema.index({ userId: 1 });
contactSchema.index({ 'contacts.phoneNumber': 1 });

// Static methods
contactSchema.statics.findByUserId = function(userId: string) {
  return this.findOne({ userId }).populate('userId', 'username displayName');
};

contactSchema.statics.addContact = async function(userId: string, phoneNumber: string, displayName: string) {
  return this.findOneAndUpdate(
    { userId },
    { 
      $addToSet: { 
        contacts: { phoneNumber, displayName, addedAt: new Date() }
      }
    },
    { upsert: true, new: true }
  );
};

contactSchema.statics.removeContact = async function(userId: string, phoneNumber: string) {
  return this.findOneAndUpdate(
    { userId },
    { 
      $pull: { 
        contacts: { phoneNumber }
      }
    },
    { new: true }
  );
};

contactSchema.statics.updateContact = async function(userId: string, phoneNumber: string, displayName: string) {
  return this.findOneAndUpdate(
    { userId, 'contacts.phoneNumber': phoneNumber },
    { 
      $set: { 
        'contacts.$.displayName': displayName,
        'contacts.$.addedAt': new Date()
      }
    },
    { new: true }
  );
};

contactSchema.statics.findContactByPhone = function(userId: string, phoneNumber: string) {
  return this.findOne({
    userId,
    'contacts.phoneNumber': phoneNumber
  });
};

contactSchema.statics.getAllContacts = function(userId: string) {
  return this.findOne({ userId })
    .select('contacts')
    .lean();
};

// Instance methods
contactSchema.methods.hasContact = function(phoneNumber: string) {
  return this.contacts.some((contact: any) => 
    contact.phoneNumber === phoneNumber
  );
};

contactSchema.methods.getContactByPhone = function(phoneNumber: string) {
  return this.contacts.find((contact: any) => 
    contact.phoneNumber === phoneNumber
  );
};

contactSchema.methods.addContact = function(phoneNumber: string, displayName: string) {
  if (!this.hasContact(phoneNumber)) {
    this.contacts.push({
      phoneNumber,
      displayName,
      addedAt: new Date()
    });
  } else {
    // Update existing contact
    const contact = this.getContactByPhone(phoneNumber);
    if (contact) {
      contact.displayName = displayName;
      contact.addedAt = new Date();
    }
  }
  return this.save();
};

contactSchema.methods.removeContact = function(phoneNumber: string) {
  this.contacts = this.contacts.filter((contact: any) => 
    contact.phoneNumber !== phoneNumber
  );
  return this.save();
};

contactSchema.methods.updateContact = function(phoneNumber: string, displayName: string) {
  const contact = this.getContactByPhone(phoneNumber);
  if (contact) {
    contact.displayName = displayName;
    contact.addedAt = new Date();
    return this.save();
  }
  return Promise.resolve(this);
};

// Validation
contactSchema.pre('save', function(next) {
  // Ensure no duplicate phone numbers
  const phoneNumbers = this.contacts.map((contact: any) => contact.phoneNumber);
  const uniquePhoneNumbers = [...new Set(phoneNumbers)];
  
  if (phoneNumbers.length !== uniquePhoneNumbers.length) {
    return next(new Error('Duplicate phone numbers in contacts list'));
  }
  
  // Limit number of contacts (for performance)
  if (this.contacts.length > 1000) {
    return next(new Error('Cannot have more than 1000 contacts'));
  }
  
  next();
});

export const Contact = mongoose.model<IContact>('Contact', contactSchema);
