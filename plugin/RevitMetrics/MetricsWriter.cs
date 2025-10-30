using Autodesk.Revit.UI;
using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;

namespace RevitMetrics
{
    public static class MetricsWriter
    {
        private const string ApiBaseUrl = "http://server_ip:port";
        private static readonly HttpClient httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(5)
        };

        public static void Send(MetricsData data)
        {
            // Отдельный поток, чтобы не блокировать Revit
            Thread thread = new Thread(() =>
            {
                try
                {
                    // 1. Получаем пользователя
                    string userUrl = $"{ApiBaseUrl}/users/?nickname={data.Username}";
                    HttpResponseMessage userResponse = httpClient.GetAsync(userUrl).Result;

                    if (!userResponse.IsSuccessStatusCode)
                    {
                        TaskDialog.Show("Ошибка", $"Ошибка при получении пользователя: {userResponse.StatusCode}");
                        return;
                    }

                    string userJson = userResponse.Content.ReadAsStringAsync().Result;
                    var users = JsonSerializer.Deserialize<UserResponse[]>(userJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                    int userId;
                    if (users.Length == 0)
                    {
                        // Пользователя нет — создаём
                        var newUser = new
                        {
                            nickname = data.Username,
                            name = "Неизвестно",
                            surname = "Неизвестно",
                            patronymic = ""
                        };

                        var json = JsonSerializer.Serialize(newUser);
                        var content = new StringContent(json, Encoding.UTF8, "application/json");
                        var createResponse = httpClient.PostAsync($"{ApiBaseUrl}/users/", content).Result;

                        if (!createResponse.IsSuccessStatusCode)
                        {
                            TaskDialog.Show("Ошибка", $"Не удалось создать пользователя: {createResponse.StatusCode}");
                            return;
                        }

                        string createdJson = createResponse.Content.ReadAsStringAsync().Result;
                        var created = JsonSerializer.Deserialize<UserResponse>(createdJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                        userId = created.Id;
                    }
                    else
                    {
                        userId = users[0].Id;
                    }

                    // 2. Отправляем метрику
                    var payload = new
                    {
                        user_id = userId,
                        project = data.ProjectName,
                        timestamp = data.Timestamp,
                        added = data.Added,
                        modified = data.Modified,
                        deleted = data.Deleted
                    };

                    var metricsJson = JsonSerializer.Serialize(payload);
                    var metricsContent = new StringContent(metricsJson, Encoding.UTF8, "application/json");

                    var metricsResponse = httpClient.PostAsync($"{ApiBaseUrl}/metrics/", metricsContent).Result;

                    if (!metricsResponse.IsSuccessStatusCode)
                    {
                        TaskDialog.Show("Ошибка", $"Ошибка при записи метрик: {metricsResponse.StatusCode}");
                    }
                }
                catch (Exception ex)
                {
                    TaskDialog.Show("Ошибка MetricsWriter", ex.Message);
                }
            });

            thread.Start();
        }

        private class UserResponse
        {
            public int Id { get; set; }
            public string Nickname { get; set; }
            public string Name { get; set; }
            public string Surname { get; set; }
            public string Patronymic { get; set; }
        }
    }
}
