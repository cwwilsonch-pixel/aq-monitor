export const configSchema = {
  type: 'object',
  required: ['databases', 'queues'],
  properties: {
    databases: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id','user','password','connectString'],
        properties: {
          id: { type: 'string' },
          user: { type: 'string' },
          password: { type: 'string' },
          connectString: { type: 'string' },
          poolMin: { type: 'number' },
          poolMax: { type: 'number' }
        }
      }
    },
    queues: {
      type: 'array',
      items: {
        type: 'object',
        required: ['dbId','name','group'],
        properties: {
          dbId: { type: 'string' },
          name: { type: 'string' },
          group: { type: 'string' },
          enabled: { type: 'boolean' }
        }
      }
    },
    groups: {
      type: 'array',
      items: { type: 'string' }
    },
    polling: {
      type: 'object',
      properties: {
        intervalMs: { type: 'number' }
      }
    }
  }
};