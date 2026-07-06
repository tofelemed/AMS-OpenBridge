/**
 * Validation Utilities
 */

import { body, validationResult, ValidationChain } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from './errors';

export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      await Promise.all(validations.map((validation) => validation.run(req)));

      const errors = validationResult(req);
      if (errors.isEmpty()) {
        return next();
      }

      const errorMessages = errors.array().map((err) => err.msg).join(', ');
      return next(new ValidationError(errorMessages));
    } catch (error) {
      return next(error);
    }
  };
};

// Login validation - accepts username or email
export const validateLogin = validate([
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 100 })
    .withMessage('Username must be between 3 and 100 characters'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
]);

// Create user validation
export const validateCreateUser = validate([
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 100 })
    .withMessage('Username must be between 3 and 100 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('role')
    .optional()
    .isIn(['Admin', 'Engineer', 'Operator', 'Viewer'])
    .withMessage('Invalid role'),
  body('full_name')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Full name must be less than 200 characters'),
]);

// Update user validation
export const validateUpdateUser = validate([
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  body('role')
    .optional()
    .isIn(['Admin', 'Engineer', 'Operator', 'Viewer'])
    .withMessage('Invalid role'),
  body('full_name')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Full name must be less than 200 characters'),
  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be a boolean'),
]);

// Update profile validation
export const validateUpdateProfile = validate([
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  body('full_name')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Full name must be less than 200 characters'),
]);

// Change password validation
export const validateChangePassword = validate([
  body('current_password')
    .notEmpty()
    .withMessage('Current password is required'),
  body('new_password')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number'),
]);
