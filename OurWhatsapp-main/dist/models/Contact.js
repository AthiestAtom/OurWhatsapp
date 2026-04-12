"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Contact = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const contactItemSchema = new mongoose_1.Schema({
    phoneNumber: {
        type: String,
        required: true,
        validate: {
            validator: function (phone) {
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
const contactSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
        index: true
    },
    contacts: [contactItemSchema]
}, {
    timestamps: true,
    toJSON: {
        transform: function (doc, ret) {
            delete ret.__v;
            return ret;
        }
    }
});
contactSchema.index({ userId: 1 });
contactSchema.index({ 'contacts.phoneNumber': 1 });
contactSchema.statics.findByUserId = function (userId) {
    return this.findOne({ userId }).populate('userId', 'username displayName');
};
contactSchema.statics.addContact = async function (userId, phoneNumber, displayName) {
    return this.findOneAndUpdate({ userId }, {
        $addToSet: {
            contacts: { phoneNumber, displayName, addedAt: new Date() }
        }
    }, { upsert: true, new: true });
};
contactSchema.statics.removeContact = async function (userId, phoneNumber) {
    return this.findOneAndUpdate({ userId }, {
        $pull: {
            contacts: { phoneNumber }
        }
    }, { new: true });
};
contactSchema.statics.updateContact = async function (userId, phoneNumber, displayName) {
    return this.findOneAndUpdate({ userId, 'contacts.phoneNumber': phoneNumber }, {
        $set: {
            'contacts.$.displayName': displayName,
            'contacts.$.addedAt': new Date()
        }
    }, { new: true });
};
contactSchema.statics.findContactByPhone = function (userId, phoneNumber) {
    return this.findOne({
        userId,
        'contacts.phoneNumber': phoneNumber
    });
};
contactSchema.statics.getAllContacts = function (userId) {
    return this.findOne({ userId })
        .select('contacts')
        .lean();
};
contactSchema.methods.hasContact = function (phoneNumber) {
    return this.contacts.some((contact) => contact.phoneNumber === phoneNumber);
};
contactSchema.methods.getContactByPhone = function (phoneNumber) {
    return this.contacts.find((contact) => contact.phoneNumber === phoneNumber);
};
contactSchema.methods.addContact = function (phoneNumber, displayName) {
    if (!this.hasContact(phoneNumber)) {
        this.contacts.push({
            phoneNumber,
            displayName,
            addedAt: new Date()
        });
    }
    else {
        const contact = this.getContactByPhone(phoneNumber);
        if (contact) {
            contact.displayName = displayName;
            contact.addedAt = new Date();
        }
    }
    return this.save();
};
contactSchema.methods.removeContact = function (phoneNumber) {
    this.contacts = this.contacts.filter((contact) => contact.phoneNumber !== phoneNumber);
    return this.save();
};
contactSchema.methods.updateContact = function (phoneNumber, displayName) {
    const contact = this.getContactByPhone(phoneNumber);
    if (contact) {
        contact.displayName = displayName;
        contact.addedAt = new Date();
        return this.save();
    }
    return Promise.resolve(this);
};
contactSchema.pre('save', function (next) {
    const phoneNumbers = this.contacts.map((contact) => contact.phoneNumber);
    const uniquePhoneNumbers = [...new Set(phoneNumbers)];
    if (phoneNumbers.length !== uniquePhoneNumbers.length) {
        return next(new Error('Duplicate phone numbers in contacts list'));
    }
    if (this.contacts.length > 1000) {
        return next(new Error('Cannot have more than 1000 contacts'));
    }
    next();
});
exports.Contact = mongoose_1.default.model('Contact', contactSchema);
//# sourceMappingURL=Contact.js.map