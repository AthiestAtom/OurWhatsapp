import { Document, Types } from 'mongoose';
export interface IUser extends Document {
    _id: Types.ObjectId;
    phoneNumber: string;
    username: string;
    displayName: string;
    profilePicture?: string;
    status?: string;
    lastSeen: Date;
    isOnline: boolean;
    publicKey?: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface IConversation extends Document {
    _id: Types.ObjectId;
    participants: Types.ObjectId[];
    isGroup: boolean;
    groupName?: string;
    groupPicture?: string;
    createdBy: Types.ObjectId;
    admins: Types.ObjectId[];
    lastMessage?: {
        content: string;
        sender: Types.ObjectId;
        timestamp: Date;
        type: MessageType;
    };
    createdAt: Date;
    updatedAt: Date;
}
export interface IMessage extends Document {
    _id: Types.ObjectId;
    conversationId: Types.ObjectId;
    sender: Types.ObjectId;
    content: string;
    encryptedContent?: string;
    encryptionKey?: string;
    iv?: string;
    type: MessageType;
    metadata?: {
        fileName?: string;
        fileSize?: number;
        mimeType?: string;
        thumbnail?: string;
    };
    status: MessageStatus;
    readBy: Array<{
        user: Types.ObjectId;
        readAt: Date;
    }>;
    replyTo?: Types.ObjectId;
    deletedAt?: Date;
    createdAt: Date;
}
export interface IContact extends Document {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    contacts: Array<{
        phoneNumber: string;
        displayName: string;
        addedAt: Date;
    }>;
    updatedAt: Date;
}
export declare enum MessageType {
    TEXT = "text",
    IMAGE = "image",
    VIDEO = "video",
    DOCUMENT = "document",
    LOCATION = "location",
    AUDIO = "audio",
    MEDIA = "media"
}
export declare enum MessageStatus {
    SENT = "sent",
    DELIVERED = "delivered",
    READ = "read"
}
export interface JWTPayload {
    userId: string;
    phoneNumber: string;
    iat?: number;
    exp?: number;
}
export interface SocketUser {
    userId: string;
    socketId: string;
    isOnline: boolean;
}
export interface MessagePayload {
    conversationId: string;
    content: string;
    type: MessageType;
    replyTo?: string;
    metadata?: any;
}
export interface TypingPayload {
    conversationId: string;
    isTyping: boolean;
}
export interface ApiResponse<T = any> {
    success: boolean;
    message: string;
    data?: T;
    error?: string;
}
export interface PaginationQuery {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}
export interface PaginationResult<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
}
export interface CreateUserRequest {
    phoneNumber: string;
    username: string;
    displayName: string;
    status?: string;
}
export interface UpdateUserRequest {
    displayName?: string;
    status?: string;
    profilePicture?: string;
}
export interface CreateConversationRequest {
    participants: string[];
    isGroup?: boolean;
    groupName?: string;
}
export interface SendMessageRequest {
    content: string;
    type: MessageType;
    replyTo?: string;
}
export interface MediaUploadRequest {
    file: Express.Multer.File;
    type: MessageType;
}
//# sourceMappingURL=index.d.ts.map