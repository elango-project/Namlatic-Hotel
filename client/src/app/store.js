import { configureStore } from '@reduxjs/toolkit';
import hotelsReducer from '../features/hotels/hotelsSlice';
import authReducer from '../store/authSlice';

export const store = configureStore({
  reducer: {
    hotels: hotelsReducer,
    auth: authReducer,
  },
});

export default store;
