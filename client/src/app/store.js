import { configureStore } from '@reduxjs/toolkit';
import hotelsReducer from '../features/hotels/hotelsSlice';

export const store = configureStore({
  reducer: {
    hotels: hotelsReducer,
  },
});

export default store;
