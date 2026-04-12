import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Stepper,
  Step,
  StepLabel,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { authService } from '../services/authService';
import { firebasePhoneService } from '../services/firebaseService';

const steps = ['Send Code', 'Register'];

// Country codes for common countries
const countryCodes = [
  { code: '+1', country: 'USA/Canada' },
  { code: '+44', country: 'UK' },
  { code: '+91', country: 'India' },
  { code: '+86', country: 'China' },
  { code: '+81', country: 'Japan' },
  { code: '+82', country: 'South Korea' },
  { code: '+61', country: 'Australia' },
  { code: '+49', country: 'Germany' },
  { code: '+33', country: 'France' },
  { code: '+39', country: 'Italy' },
  { code: '+34', country: 'Spain' },
  { code: '+7', country: 'Russia' },
  { code: '+55', country: 'Brazil' },
  { code: '+52', country: 'Mexico' },
  { code: '+27', country: 'South Africa' },
  { code: '+20', country: 'Egypt' },
  { code: '+234', country: 'Nigeria' },
  { code: '+62', country: 'Indonesia' },
  { code: '+63', country: 'Philippines' },
  { code: '+66', country: 'Thailand' },
  { code: '+84', country: 'Vietnam' },
  { code: '+90', country: 'Turkey' },
  { code: '+31', country: 'Netherlands' },
  { code: '+46', country: 'Sweden' },
  { code: '+47', country: 'Norway' },
  { code: '+358', country: 'Finland' },
  { code: '+45', country: 'Denmark' },
  { code: '+41', country: 'Switzerland' },
  { code: '+43', country: 'Austria' },
  { code: '+351', country: 'Portugal' },
  { code: '+30', country: 'Greece' },
  { code: '+972', country: 'Israel' },
  { code: '+971', country: 'UAE' },
  { code: '+966', country: 'Saudi Arabia' },
];

const Register = ({ setUser }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeStep, setActiveStep] = useState(0);
  const [verificationSent, setVerificationSent] = useState(false);
  const [countryCode, setCountryCode] = useState('+1'); // Default to USA/Canada
  
  const {
    register,
    control,
    formState: { errors },
    handleSubmit,
    setValue,
  } = useForm();

  // Initialize Firebase reCAPTCHA when component mounts
  useEffect(() => {
    // Create reCAPTCHA container
    const recaptchaContainer = document.createElement('div');
    recaptchaContainer.id = 'recaptcha-container';
    recaptchaContainer.style.display = 'none';
    document.body.appendChild(recaptchaContainer);

    // Initialize Firebase reCAPTCHA
    firebasePhoneService.initializeRecaptcha('recaptcha-container');

    // Cleanup on unmount
    return () => {
      const container = document.getElementById('recaptcha-container');
      if (container) {
        document.body.removeChild(container);
      }
    };
  }, []);

  const onSubmitSendCode = async (data) => {
    setLoading(true);
    setError('');

    try {
      const fullPhoneNumber = `${countryCode}${data.phoneNumber}`;
      
      // Use Firebase for REAL SMS
      const result = await firebasePhoneService.sendVerificationCode(fullPhoneNumber);
      
      if (result.success) {
        toast.success('REAL SMS sent to your phone! Check your messages.');
        setVerificationSent(true);
        setActiveStep(1);
        
        // If fallback code was provided, show it
        if (result.fallbackCode) {
          toast(`Fallback code: ${result.fallbackCode}`, {
            duration: 10000,
            icon: 'info',
          });
        }
      } else {
        throw new Error(result.error || 'Firebase SMS failed');
      }
    } catch (error) {
      setError(error || 'Failed to send verification code');
      toast.error(error || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const onSubmitRegister = async (data) => {
    setLoading(true);
    setError('');

    try {
      const fullPhoneNumber = `${countryCode}${data.phoneNumber}`;
      const user = await authService.register({
        ...data,
        phoneNumber: fullPhoneNumber
      });
      setUser(user);
      toast.success('Registration successful!');
      navigate('/chats');
    } catch (error) {
      setError(error || 'Registration failed');
      toast.error(error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const renderSendCodeStep = () => (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h6" gutterBottom>
        Verify Your Phone Number
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        We'll send a verification code to your phone number
      </Typography>
      
      <Box component="form" onSubmit={handleSubmit(onSubmitSendCode)}>
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel id="country-code-label">Country</InputLabel>
            <Select
              labelId="country-code-label"
              value={countryCode}
              label="Country"
              onChange={(e) => setCountryCode(e.target.value)}
              disabled={loading}
            >
              {countryCodes.map((country) => (
                <MenuItem key={country.code} value={country.code}>
                  {country.code} {country.country}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <TextField
            fullWidth
            label="Phone Number"
            type="tel"
            placeholder="1234567890"
            {...register('phoneNumber', {
              required: 'Phone number is required',
              pattern: {
                value: /^[0-9]{6,15}$/,
                message: 'Phone number must be 6-15 digits',
              },
            })}
            error={!!errors.phoneNumber}
            helperText={errors.phoneNumber?.message || 'Enter number without country code'}
            disabled={loading}
          />
        </Box>
        
        <Button
          type="submit"
          fullWidth
          variant="contained"
          sx={{ mt: 3, mb: 2 }}
          disabled={loading}
          size="large"
        >
          {loading ? <CircularProgress size={24} /> : 'Send Verification Code'}
        </Button>
      </Box>
    </Box>
  );

  const renderRegisterStep = () => (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h6" gutterBottom>
        Complete Registration
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Enter the verification code sent to your phone and complete your registration
      </Typography>
      
      <Box component="form" onSubmit={handleSubmit(onSubmitRegister)}>
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel id="country-code-label-2">Country</InputLabel>
            <Select
              labelId="country-code-label-2"
              value={countryCode}
              label="Country"
              onChange={(e) => setCountryCode(e.target.value)}
              disabled={loading}
            >
              {countryCodes.map((country) => (
                <MenuItem key={country.code} value={country.code}>
                  {country.code} {country.country}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <TextField
            fullWidth
            label="Phone Number"
            type="tel"
            placeholder="1234567890"
            {...register('phoneNumber', {
              required: 'Phone number is required',
              pattern: {
                value: /^[0-9]{6,15}$/,
                message: 'Phone number must be 6-15 digits',
              },
            })}
            error={!!errors.phoneNumber}
            helperText={errors.phoneNumber?.message || 'Enter number without country code'}
            disabled={loading}
          />
        </Box>
        
        <TextField
          fullWidth
          label="Verification Code"
          margin="normal"
          placeholder="Enter 6-digit code"
          {...register('verificationCode', {
            required: 'Verification code is required',
            minLength: {
              value: 6,
              message: 'Verification code must be 6 digits',
            },
            maxLength: {
              value: 6,
              message: 'Verification code must be 6 digits',
            },
          })}
          error={!!errors.verificationCode}
          helperText={errors.verificationCode?.message}
          disabled={loading}
        />
        
        <TextField
          fullWidth
          label="Username"
          margin="normal"
          {...register('username', {
            required: 'Username is required',
            minLength: {
              value: 3,
              message: 'Username must be at least 3 characters',
            },
            pattern: {
              value: /^[a-zA-Z0-9_]+$/,
              message: 'Username can only contain letters, numbers, and underscores',
            },
          })}
          error={!!errors.username}
          helperText={errors.username?.message}
          disabled={loading}
        />
        
        <TextField
          fullWidth
          label="Display Name"
          margin="normal"
          {...register('displayName', {
            required: 'Display name is required',
            minLength: {
              value: 2,
              message: 'Display name must be at least 2 characters',
            },
          })}
          error={!!errors.displayName}
          helperText={errors.displayName?.message}
          disabled={loading}
        />
        
        <Button
          type="submit"
          fullWidth
          variant="contained"
          sx={{ mt: 3, mb: 2 }}
          disabled={loading}
          size="large"
        >
          {loading ? <CircularProgress size={24} /> : 'Register'}
        </Button>
      </Box>
    </Box>
  );

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: '#ECE5DD',
        }}
      >
        <Paper
          elevation={3}
          sx={{
            padding: 4,
            width: '100%',
            maxWidth: 400,
          }}
        >
          <Typography variant="h4" component="h1" gutterBottom align="center" color="primary">
            OurWhatsApp
          </Typography>
          
          <Typography variant="body2" align="center" sx={{ mb: 3 }}>
            Create your account
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {activeStep === 0 && renderSendCodeStep()}
          {activeStep === 1 && renderRegisterStep()}
        </Paper>
      </Box>
    </Container>
  );
};

export default Register;
