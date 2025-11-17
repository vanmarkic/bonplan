/**
 * Anonymization Middleware Unit Tests
 */

const anonymize = require('../../../src/middleware/anonymize');

describe('Anonymization Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      ip: '192.168.1.1',
      ips: ['192.168.1.1']
    };
    res = {};
    next = jest.fn();
  });

  it('should remove all IP-related headers', () => {
    req.headers = {
      'x-real-ip': '192.168.1.1',
      'x-forwarded-for': '192.168.1.1, 10.0.0.1',
      'cf-connecting-ip': '192.168.1.1',
      'true-client-ip': '192.168.1.1',
      'x-client-ip': '192.168.1.1',
      'forwarded': 'for=192.168.1.1',
      'user-agent': 'Mozilla/5.0' // Should remain
    };

    anonymize(req, res, next);

    expect(req.headers['x-real-ip']).toBeUndefined();
    expect(req.headers['x-forwarded-for']).toBeUndefined();
    expect(req.headers['cf-connecting-ip']).toBeUndefined();
    expect(req.headers['true-client-ip']).toBeUndefined();
    expect(req.headers['x-client-ip']).toBeUndefined();
    expect(req.headers['forwarded']).toBeUndefined();
    expect(req.headers['user-agent']).toBe('Mozilla/5.0'); // Non-IP header remains
  });

  it('should override req.ip to return "anonymous"', () => {
    anonymize(req, res, next);

    expect(req.ip).toBe('anonymous');
  });

  it('should override req.ips to return empty array', () => {
    anonymize(req, res, next);

    expect(req.ips).toEqual([]);
  });

  it('should extract and remove x-anonymous-id header', () => {
    req.headers['x-anonymous-id'] = 'hashed-identifier-123';

    anonymize(req, res, next);

    expect(req.anonId).toBe('hashed-identifier-123');
    expect(req.headers['x-anonymous-id']).toBeUndefined();
  });

  it('should set anonId to "unknown" if header not present', () => {
    anonymize(req, res, next);

    expect(req.anonId).toBe('unknown');
  });

  it('should call next()', () => {
    anonymize(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('should not throw error if headers are missing', () => {
    req.headers = {};

    expect(() => {
      anonymize(req, res, next);
    }).not.toThrow();

    expect(next).toHaveBeenCalled();
  });
});
