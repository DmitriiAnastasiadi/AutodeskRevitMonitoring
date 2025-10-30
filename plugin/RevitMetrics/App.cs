using Autodesk.Revit.UI;
using Autodesk.Revit.DB.Events;
using Autodesk.Revit.DB;
using System;

namespace RevitMetrics
{
    public class App : IExternalApplication
    {
        public Result OnStartup(UIControlledApplication application)
        {
            application.ControlledApplication.DocumentChanged += OnDocumentChanged;
            return Result.Succeeded;
        }

        public Result OnShutdown(UIControlledApplication application)
        {
            application.ControlledApplication.DocumentChanged -= OnDocumentChanged;
            return Result.Succeeded;
        }

        private void OnDocumentChanged(object sender, DocumentChangedEventArgs e)
        {
            try
            {
                Document doc = e.GetDocument();
                int added = e.GetAddedElementIds().Count;
                int modified = e.GetModifiedElementIds().Count;
                int deleted = e.GetDeletedElementIds().Count;
                string username = doc.Application.Username;

                var metrics = new MetricsData
                {
                    Username = username,
                    ProjectName = doc.Title,
                    Timestamp = DateTime.UtcNow,
                    Added = added,
                    Modified = modified,
                    Deleted = deleted
                };

                MetricsWriter.Send(metrics);
            }
            catch (Exception ex)
            {
                TaskDialog.Show("RevitMetrics Error", ex.Message);
            }
        }
    }

    public class MetricsData
    {
        public string Username { get; set; }
        public string ProjectName { get; set; }
        public DateTime Timestamp { get; set; }
        public int Added { get; set; }
        public int Modified { get; set; }
        public int Deleted { get; set; }
    }
}
