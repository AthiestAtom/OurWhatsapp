// MongoDB initialization script
db = db.getSiblingDB('whatsapp-clone');

// Create app user with read/write permissions
db.createUser({
  user: 'whatsapp_user',
  pwd: 'whatsapp_pass',
  roles: [
    {
      role: 'readWrite',
      db: 'whatsapp-clone'
    }
  ]
});

// Create initial collections with validation
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['phoneNumber', 'username', 'displayName'],
      properties: {
        phoneNumber: {
          bsonType: 'string',
          description: 'must be a string and is required'
        },
        username: {
          bsonType: 'string',
          description: 'must be a string and is required'
        },
        displayName: {
          bsonType: 'string',
          description: 'must be a string and is required'
        }
      }
    }
  }
});

db.createCollection('conversations');
db.createCollection('messages');
db.createCollection('contacts');

print('Database initialized successfully');
