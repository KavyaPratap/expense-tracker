package com.smartspend.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.widget.RemoteViews;

public class SmartWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        // Read from capacitor-widget-bridge defaults group
        SharedPreferences prefs = context.getSharedPreferences("group.expensebuilder.widget", Context.MODE_PRIVATE);

        // Extract synced budget parameters from React
        String title = prefs.getString("widget_title", "Smart Spend");
        String subtitle = prefs.getString("widget_subtitle", "Tap + to manage your money.");
        String colorState = prefs.getString("widget_color_state", "safe");

        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId, title, subtitle, colorState);
        }
    }

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId, String title, String subtitle, String colorState) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_layout);

        // Bind Dynamic Text
        views.setTextViewText(R.id.widget_title, title);
        views.setTextViewText(R.id.widget_subtitle, subtitle);

        // Style overrides based on React context
        if ("danger".equals(colorState)) {
            views.setTextColor(R.id.widget_title, Color.parseColor("#FF6B6B")); // Match React Destructive Red
        } else {
            views.setTextColor(R.id.widget_title, Color.WHITE);
        }

        // Deep linking: Clicking the "+" button opens the App to Add Transaction
        Intent intent = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse("com.smartspend.app://widget/add_transaction"));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context, 
                0, 
                intent, 
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_action_button, pendingIntent);

        // Deep linking: Clicking the whole widget opens the App normally
        Intent mainIntent = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse("com.smartspend.app://widget/open"));
        mainIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent mainPendingIntent = PendingIntent.getActivity(
                context, 
                1, 
                mainIntent, 
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_title, mainPendingIntent);

        // Instruct the widget manager to update the widget
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
}
